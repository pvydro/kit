/**
 * Profile spec types — the manifest and auxiliary files that define a kit profile.
 * See note-vault/kit/10-profile-spec.md for the authoritative draft.
 */

export interface ProfileManifest {
	name: string;
	description?: string;
	/** Manifest schema version. Bump only on breaking changes. */
	version: number;
	/** This profile's own semver (informational). */
	profileVersion?: string;
	/** Kit core semver range this profile supports. */
	kit?: string;
	author?: string;
	license?: string;
}

export interface McpServerDecl {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
	restartOnCrash?: boolean;
	cwd?: string;
	stdio?: boolean;
}

export interface McpServersConfig {
	servers: McpServerDecl[];
}

export interface HookOnRule {
	tool: string;
	pathMatch?: string;
	commandRegex?: string;
}

export interface HookWhenRule {
	cwdPrefixIn?: string[];
}

export interface HookRule {
	id: string;
	on: HookOnRule;
	when?: HookWhenRule;
	call?: string;
	input?: Record<string, unknown>;
	blockOnError?: boolean;
	block?: boolean;
	reason?: string;
}

export interface HooksConfig {
	hooks: HookRule[];
}

export interface SlashCommandArg {
	name: string;
	required?: boolean;
}

export interface SlashToolCallAction {
	kind: "tool_call";
	tool: string;
	input: Record<string, unknown>;
}

export interface SlashPromptAction {
	kind: "prompt";
	template: string;
}

export type SlashAction = SlashToolCallAction | SlashPromptAction;

export interface SlashCommand {
	name: string;
	description?: string;
	args?: SlashCommandArg[];
	action: SlashAction;
}

export type ProfileConfig = Record<string, unknown>;

export interface LoadedProfile {
	/** Absolute path to the profile directory. */
	path: string;
	manifest: ProfileManifest;
	/** Content of system-prompt.md. Always present (may be empty string). */
	systemPrompt: string;
	mcpServers?: McpServersConfig;
	hooks?: HooksConfig;
	slashCommands?: SlashCommand[];
	claudeMdOverlay?: string;
	config?: ProfileConfig;
	/** Absolute paths of files under memory/. */
	memoryFiles?: string[];
}
