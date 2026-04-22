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

import { minimatch } from "minimatch";
import type { ExtensionAPI, ExtensionFactory, ToolCallEvent, ToolCallEventResult } from "../core/extensions/types.js";
import type { HookRule, HooksConfig } from "./spec.js";

export function createHooksExtensionFactory(hooks: HooksConfig): ExtensionFactory {
	return (api: ExtensionAPI): void => {
		api.on("tool_call", async (event: ToolCallEvent): Promise<ToolCallEventResult | undefined> => {
			for (const rule of hooks.hooks ?? []) {
				if (!ruleMatches(rule, event)) continue;
				if (rule.block) {
					return {
						block: true,
						reason: rule.reason ?? `Blocked by hook: ${rule.id}`,
					};
				}
				// rule.call (invoke another tool before this one) deferred.
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
