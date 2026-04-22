/**
 * Variable substitution for profile-declared templates.
 *
 * Syntax: ${namespace.key[.nested...]}
 *
 * Namespaces recognized in M5:
 *   ${args.<name>}         slash-command arg, named
 *   ${args.rest}           slash-command leftover after named positional args
 *   ${profile.config.<k>}  value from profile's config.yaml
 *   ${env.<NAME>}          environment variable
 *
 * Unresolved references are left as literal `${...}` in the output (loud
 * failure — the user sees the typo or missing arg in the rendered message).
 *
 * M4.5 will extend SubstitutionContext with `toolInput` for hook `call`
 * actions; the resolver is generic so no substitute() change is needed.
 */

export interface SubstitutionContext {
	args?: Record<string, string>;
	argsRest?: string;
	profileConfig?: Record<string, unknown>;
	env?: NodeJS.ProcessEnv;
	toolInput?: Record<string, unknown>;
}

export function substitute(template: string, ctx: SubstitutionContext): string {
	return template.replace(/\$\{([^}]+)\}/g, (match, expr: string) => {
		const resolved = resolveExpr(expr.trim(), ctx);
		return resolved ?? match;
	});
}

/**
 * Recursively substitute inside string values of a nested object. Non-string
 * values (numbers, booleans, nested objects, arrays) are preserved; substitution
 * only happens at string leaves. Returns a new object; input is not mutated.
 */
export function substituteObject(input: unknown, ctx: SubstitutionContext): unknown {
	if (typeof input === "string") return substitute(input, ctx);
	if (Array.isArray(input)) return input.map((v) => substituteObject(v, ctx));
	if (input && typeof input === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
			out[k] = substituteObject(v, ctx);
		}
		return out;
	}
	return input;
}

function resolveExpr(expr: string, ctx: SubstitutionContext): string | undefined {
	const segments = expr.split(".");
	if (segments.length === 0) return undefined;
	const [head, ...rest] = segments;

	switch (head) {
		case "args":
			return resolveArgs(rest, ctx);
		case "profile":
			return resolveProfile(rest, ctx);
		case "env":
			return resolveEnv(rest, ctx);
		case "tool_input":
		case "toolInput":
			return resolveDotPath(ctx.toolInput, rest);
		default:
			return undefined;
	}
}

function resolveArgs(rest: string[], ctx: SubstitutionContext): string | undefined {
	if (rest.length !== 1) return undefined;
	if (rest[0] === "rest") return ctx.argsRest;
	return ctx.args?.[rest[0]];
}

function resolveProfile(rest: string[], ctx: SubstitutionContext): string | undefined {
	if (rest[0] !== "config" || rest.length < 2) return undefined;
	return resolveDotPath(ctx.profileConfig, rest.slice(1));
}

function resolveEnv(rest: string[], ctx: SubstitutionContext): string | undefined {
	if (rest.length !== 1) return undefined;
	const v = (ctx.env ?? process.env)[rest[0]];
	return typeof v === "string" ? v : undefined;
}

function resolveDotPath(root: unknown, path: string[]): string | undefined {
	let cur: unknown = root;
	for (const key of path) {
		if (!cur || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[key];
	}
	if (typeof cur === "string") return cur;
	if (typeof cur === "number" || typeof cur === "boolean") return String(cur);
	return undefined;
}
