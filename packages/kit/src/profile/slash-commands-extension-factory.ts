/**
 * Profile-declared slash commands.
 *
 * For each SlashCommand declared by the profile, register an extension
 * command. On invocation:
 *   1. Parse the raw args string into positional tokens (via kit's existing
 *      parseCommandArgs — respects bash-style quoting).
 *   2. Bind declared positional args by order. Leftover tokens become
 *      `${args.rest}`.
 *   3. Render the action (prompt or tool_call) with variable substitution.
 *   4. Queue the rendered text as a user message via api.sendUserMessage.
 *
 * For `tool_call` kind, we render an imperative prompt asking the model to
 * invoke the named tool with the JSON-formatted args. The model almost always
 * complies. No direct tool invocation primitive is exposed on ExtensionAPI
 * (M4.5 would be the place to revisit if we find one).
 */

import type { ExtensionAPI, ExtensionFactory } from "../core/extensions/types.js";
import { parseCommandArgs } from "../core/prompt-templates.js";
import type { ProfileConfig, SlashAction, SlashCommand } from "./spec.js";
import { type SubstitutionContext, substitute, substituteObject } from "./substitution.js";

interface ArgsContext {
	args: Record<string, string>;
	argsRest: string;
}

export function createSlashCommandsExtensionFactory(
	commands: SlashCommand[],
	profileConfig: ProfileConfig | undefined,
): ExtensionFactory {
	return (api: ExtensionAPI): void => {
		for (const cmd of commands) {
			api.registerCommand(cmd.name, {
				description: cmd.description,
				handler: async (argsString) => {
					const argsCtx = buildArgsContext(cmd, argsString);
					const message = renderAction(cmd.action, argsCtx, profileConfig);
					api.sendUserMessage(message);
				},
			});
		}
	};
}

function buildArgsContext(cmd: SlashCommand, argsString: string): ArgsContext {
	const tokens = parseCommandArgs(argsString);
	const declared = cmd.args ?? [];
	const args: Record<string, string> = {};

	for (let i = 0; i < declared.length; i++) {
		if (i < tokens.length) {
			args[declared[i].name] = tokens[i];
		}
	}

	const restTokens = tokens.slice(declared.length);
	const argsRest = restTokens.join(" ");

	return { args, argsRest };
}

function renderAction(action: SlashAction, argsCtx: ArgsContext, profileConfig: ProfileConfig | undefined): string {
	const ctx: SubstitutionContext = {
		args: argsCtx.args,
		argsRest: argsCtx.argsRest,
		profileConfig: profileConfig as Record<string, unknown> | undefined,
		env: process.env,
	};

	if (action.kind === "prompt") {
		return substitute(action.template, ctx);
	}

	const renderedInput = substituteObject(action.input, ctx);
	return (
		`Call the \`${action.tool}\` tool with these arguments and report the result verbatim:\n\n` +
		`\`\`\`json\n${JSON.stringify(renderedInput, null, 2)}\n\`\`\``
	);
}
