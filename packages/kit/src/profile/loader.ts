/**
 * Profile loader — reads a kit profile directory from disk into a typed LoadedProfile.
 * Zero code execution from the profile (profile-as-data, see ADR-002).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
	HooksConfig,
	LoadedProfile,
	McpServersConfig,
	ProfileConfig,
	ProfileManifest,
	SlashCommand,
} from "./spec.js";

export class ProfileLoadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProfileLoadError";
	}
}

function readYaml<T>(path: string): T {
	const raw = readFileSync(path, "utf-8");
	return parseYaml(raw) as T;
}

function validateManifest(manifest: unknown, path: string): ProfileManifest {
	if (!manifest || typeof manifest !== "object") {
		throw new ProfileLoadError(`Invalid manifest at ${path}: expected an object`);
	}
	const m = manifest as Record<string, unknown>;
	if (typeof m.name !== "string" || m.name.length === 0) {
		throw new ProfileLoadError(`Invalid manifest at ${path}: missing 'name' (string)`);
	}
	if (typeof m.version !== "number") {
		throw new ProfileLoadError(`Invalid manifest at ${path}: missing 'version' (number)`);
	}
	return m as unknown as ProfileManifest;
}

export function loadProfile(profilePath: string): LoadedProfile {
	const path = resolve(profilePath);

	if (!existsSync(path) || !statSync(path).isDirectory()) {
		throw new ProfileLoadError(`Profile path is not a directory: ${path}`);
	}

	const manifestPath = join(path, "manifest.yaml");
	if (!existsSync(manifestPath)) {
		throw new ProfileLoadError(`Profile manifest not found: ${manifestPath}`);
	}
	const manifest = validateManifest(readYaml<unknown>(manifestPath), manifestPath);

	const systemPromptPath = join(path, "system-prompt.md");
	if (!existsSync(systemPromptPath)) {
		throw new ProfileLoadError(`Profile system-prompt.md not found: ${systemPromptPath}`);
	}
	const systemPrompt = readFileSync(systemPromptPath, "utf-8");

	const result: LoadedProfile = {
		path,
		manifest,
		systemPrompt,
	};

	const mcpPath = join(path, "mcp-servers.yaml");
	if (existsSync(mcpPath)) {
		result.mcpServers = readYaml<McpServersConfig>(mcpPath);
	}

	const hooksPath = join(path, "hooks.yaml");
	if (existsSync(hooksPath)) {
		result.hooks = readYaml<HooksConfig>(hooksPath);
	}

	const configPath = join(path, "config.yaml");
	if (existsSync(configPath)) {
		result.config = readYaml<ProfileConfig>(configPath);
	}

	const claudeMdPath = join(path, "claude-md-overlay.md");
	if (existsSync(claudeMdPath)) {
		result.claudeMdOverlay = readFileSync(claudeMdPath, "utf-8");
	}

	const slashDir = join(path, "slash");
	if (existsSync(slashDir) && statSync(slashDir).isDirectory()) {
		const slashFiles = readdirSync(slashDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
		const slashCommands: SlashCommand[] = [];
		for (const file of slashFiles) {
			const cmd = readYaml<SlashCommand>(join(slashDir, file));
			if (cmd && typeof cmd === "object" && typeof (cmd as { name?: unknown }).name === "string") {
				slashCommands.push(cmd);
			}
		}
		if (slashCommands.length > 0) {
			result.slashCommands = slashCommands;
		}
	}

	const memoryDir = join(path, "memory");
	if (existsSync(memoryDir) && statSync(memoryDir).isDirectory()) {
		const memoryFiles = readdirSync(memoryDir)
			.filter((f) => f.endsWith(".md"))
			.map((f) => join(memoryDir, f));
		if (memoryFiles.length > 0) {
			result.memoryFiles = memoryFiles;
		}
	}

	return result;
}
