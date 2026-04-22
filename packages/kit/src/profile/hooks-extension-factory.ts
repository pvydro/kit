/**
 * Profile-driven pre-tool-use hook engine.
 *
 * Installs a single `tool_call` handler that walks the profile's hook rules.
 * On the first rule that matches AND declares `block: true`, returns
 * `{ block: true, reason }` — kit's runner short-circuits, the tool does not
 * run, and the model sees the reason.
 *
 * Matching dimensions (all optional except `on.tool`):
 *   - `on.tool`          exact match against `event.toolName`
 *   - `on.pathMatch`     glob match against `event.input.path`
 *   - `on.commandRegex`  regex match against `event.input.command`
 *   - `when.cwdPrefixIn` prefix membership check against `process.cwd()`
 *
 * Deferred (see plan): `call` action, post-tool-use hooks, mutation rules,
 * variable substitution.
 */

import { type ChildProcess, spawn } from "node:child_process";
import chalk from "chalk";
import { minimatch } from "minimatch";
import type { ExtensionAPI, ExtensionFactory, ToolCallEvent, ToolCallEventResult } from "../core/extensions/types.js";
import type { HookCallAction, HookRule, HooksConfig } from "./spec.js";
import { type SubstitutionContext, substitute } from "./substitution.js";

export function createHooksExtensionFactory(hooks: HooksConfig): ExtensionFactory {
	return (api: ExtensionAPI): void => {
		const ruleCount = hooks.hooks?.length ?? 0;
		if (ruleCount > 0) {
			console.error(chalk.dim(`[kit] Installed ${ruleCount} hook rule${ruleCount === 1 ? "" : "s"}`));
		}
		api.on("tool_call", async (event: ToolCallEvent): Promise<ToolCallEventResult | undefined> => {
			for (const rule of hooks.hooks ?? []) {
				if (!ruleMatches(rule, event)) continue;

				if (rule.call) {
					const toolInput = event.input as Record<string, unknown>;
					const { exitCode, stderr } = await runCallAction(rule.call, toolInput, rule.id);
					if (exitCode !== 0 && rule.blockOnError) {
						const base = rule.reason ?? `Blocked by hook: ${rule.id}`;
						const detail = truncate(stderr.trim(), 800);
						return { block: true, reason: detail ? `${base}\n${detail}` : base };
					}
					// exit 0 or blockOnError=false → fall through
				}

				if (rule.block) {
					return {
						block: true,
						reason: rule.reason ?? `Blocked by hook: ${rule.id}`,
					};
				}
			}
			return undefined;
		});
	};
}

function ruleMatches(rule: HookRule, event: ToolCallEvent): boolean {
	if (rule.on.tool !== event.toolName) return false;

	if (rule.on.pathMatch) {
		const inputPath = pickString(event.input, "path");
		if (!inputPath || !minimatch(inputPath, rule.on.pathMatch)) return false;
	}

	if (rule.on.commandRegex) {
		const command = pickString(event.input, "command");
		if (!command) return false;
		try {
			if (!new RegExp(rule.on.commandRegex).test(command)) return false;
		} catch {
			return false;
		}
	}

	if (rule.when?.cwdPrefixIn?.length) {
		const cwd = process.cwd();
		if (!rule.when.cwdPrefixIn.some((prefix) => cwd.startsWith(prefix))) return false;
	}

	return true;
}

function pickString(input: unknown, key: string): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const v = (input as Record<string, unknown>)[key];
	return typeof v === "string" ? v : undefined;
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max)}\n[…truncated ${s.length - max} chars]`;
}

async function runCallAction(
	call: HookCallAction,
	toolInput: Record<string, unknown>,
	ruleId: string,
): Promise<{ exitCode: number; stderr: string }> {
	const subCtx: SubstitutionContext = { toolInput };
	const command = substitute(call.command, subCtx);
	const args = (call.args ?? []).map((a) => substitute(a, subCtx));
	const envOverride = call.env
		? Object.fromEntries(Object.entries(call.env).map(([k, v]) => [k, substitute(v, subCtx)]))
		: undefined;
	const mergedEnv = envOverride ? { ...process.env, ...envOverride } : process.env;
	const cwd = call.cwd ? substitute(call.cwd, subCtx) : undefined;
	const timeoutMs = call.timeoutMs ?? 30000;

	return await new Promise((resolve) => {
		let stderr = "";
		let settled = false;
		const done = (exitCode: number) => {
			if (settled) return;
			settled = true;
			resolve({ exitCode, stderr });
		};

		let child: ChildProcess;
		try {
			child = spawn(command, args, { env: mergedEnv, cwd, stdio: ["ignore", "pipe", "pipe"] });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			resolve({ exitCode: 1, stderr: `[kit] hook ${ruleId} failed to spawn: ${message}` });
			return;
		}

		const timer = setTimeout(() => {
			stderr += `\n[kit] hook ${ruleId} timed out after ${timeoutMs}ms`;
			child.kill("SIGKILL");
			done(1);
		}, timeoutMs);

		child.stdout?.on("data", (d: Buffer | string) => {
			stderr += d.toString();
		});
		child.stderr?.on("data", (d: Buffer | string) => {
			stderr += d.toString();
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			stderr += `\n${err.message}`;
			done(1);
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			done(code ?? 1);
		});
	});
}
