/**
 * Persistent memory store at `~/.kit/memory/`.
 *
 * Per [vault 03-memory-model.md](../../../../note-vault/kit/03-memory-model.md):
 * - One file per entry: `<type>_<slug>.md` with YAML frontmatter + markdown body.
 * - MEMORY.md is an auto-maintained index (one line per entry) injected into
 *   the system prompt on startup.
 * - Profile seeding is first-run-only: if `~/.kit/memory/` doesn't exist when
 *   kit starts, files listed in `profile.memoryFiles` are copied in and the
 *   profile's MEMORY.md (if any) is copied verbatim. Subsequent runs never
 *   re-seed; user memory is sacred.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseFrontmatter } from "../utils/frontmatter.js";

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryFrontmatter {
	name: string;
	description: string;
	type: MemoryType;
}

export interface MemoryEntry {
	path: string;
	frontmatter: MemoryFrontmatter;
	body: string;
}

export function memoryDir(): string {
	return join(homedir(), ".kit", "memory");
}

export function ensureMemoryDir(): void {
	mkdirSync(memoryDir(), { recursive: true });
}

export function slugify(topic: string): string {
	const base = topic
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 60);
	return base || "entry";
}

function deriveDescription(content: string): string {
	const firstLine = content
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l.length > 0);
	return (firstLine ?? "").slice(0, 200);
}

function serializeEntry(frontmatter: MemoryFrontmatter, body: string): string {
	const fm =
		`---\n` +
		`name: ${yamlScalar(frontmatter.name)}\n` +
		`description: ${yamlScalar(frontmatter.description)}\n` +
		`type: ${frontmatter.type}\n` +
		`---\n\n`;
	return `${fm}${body.trim()}\n`;
}

function yamlScalar(s: string): string {
	// Quote if contains special chars; otherwise leave bare.
	if (/[:#&*!|>'"%@`\n]/.test(s) || s.startsWith("-") || s.startsWith("[") || s.startsWith("{")) {
		return JSON.stringify(s);
	}
	return s;
}

export function readMemoryEntry(path: string): MemoryEntry | undefined {
	if (!existsSync(path)) return undefined;
	const raw = readFileSync(path, "utf-8");
	const { frontmatter, body } = parseFrontmatter<Partial<MemoryFrontmatter>>(raw);
	if (typeof frontmatter.name !== "string" || typeof frontmatter.type !== "string") {
		return undefined;
	}
	const fm: MemoryFrontmatter = {
		name: frontmatter.name,
		description: typeof frontmatter.description === "string" ? frontmatter.description : "",
		type: frontmatter.type as MemoryType,
	};
	return { path, frontmatter: fm, body };
}

export function listMemoryEntries(): MemoryEntry[] {
	const dir = memoryDir();
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".md") && f !== "MEMORY.md")
		.map((f) => readMemoryEntry(join(dir, f)))
		.filter((e): e is MemoryEntry => e !== undefined);
}

export function writeMemoryEntry(opts: { topic: string; content: string; type: MemoryType; description?: string }): {
	path: string;
	frontmatter: MemoryFrontmatter;
} {
	ensureMemoryDir();
	const frontmatter: MemoryFrontmatter = {
		name: opts.topic,
		description: opts.description?.trim() || deriveDescription(opts.content),
		type: opts.type,
	};
	const filename = `${opts.type}_${slugify(opts.topic)}.md`;
	const path = join(memoryDir(), filename);
	writeFileSync(path, serializeEntry(frontmatter, opts.content), "utf-8");
	return { path, frontmatter };
}

export function readMemoryIndex(maxLines?: number): string {
	const path = join(memoryDir(), "MEMORY.md");
	if (!existsSync(path)) return "";
	const raw = readFileSync(path, "utf-8");
	if (maxLines === undefined) return raw;
	const lines = raw.split("\n");
	if (lines.length <= maxLines) return raw;
	return `${lines.slice(0, maxLines).join("\n")}\n[…truncated ${lines.length - maxLines} lines]`;
}

export function updateMemoryIndex(entry: MemoryEntry): void {
	ensureMemoryDir();
	const indexPath = join(memoryDir(), "MEMORY.md");
	const filename = basename(entry.path);
	const line = `- [${filename}](${filename}) — ${entry.frontmatter.description || entry.frontmatter.name}`;

	if (!existsSync(indexPath)) {
		writeFileSync(indexPath, `# Memory Index\n\n${line}\n`, "utf-8");
		return;
	}

	const current = readFileSync(indexPath, "utf-8");
	// Replace existing line for same filename, else append.
	const lines = current.split("\n");
	const idx = lines.findIndex((l) => l.includes(`[${filename}](${filename})`));
	if (idx >= 0) {
		lines[idx] = line;
	} else {
		// Ensure trailing newline before appending.
		if (!current.endsWith("\n")) lines.push("");
		lines.push(line);
	}
	writeFileSync(indexPath, lines.join("\n"), "utf-8");
}

function tokenize(s: string): string[] {
	return s
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 1);
}

export function searchMemory(query: string, limit: number): Array<{ entry: MemoryEntry; score: number }> {
	const tokens = tokenize(query);
	if (tokens.length === 0) return [];
	const entries = listMemoryEntries();
	const scored = entries
		.map((entry) => {
			const haystack = tokenize(`${entry.frontmatter.name} ${entry.frontmatter.description} ${entry.body}`);
			const counts: Record<string, number> = {};
			for (const t of haystack) counts[t] = (counts[t] ?? 0) + 1;
			const score = tokens.reduce((acc, t) => acc + (counts[t] ?? 0), 0);
			return { entry, score };
		})
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit);
}

/**
 * Seed `~/.kit/memory/` from a profile's memory files. First-run-only: if the
 * memory dir already exists, returns false (no-op). Otherwise creates the dir
 * and copies each file in, preserving filenames. Returns true on seed.
 */
export function bootstrapFromProfile(memoryFiles: string[]): boolean {
	const dir = memoryDir();
	if (existsSync(dir)) return false;
	if (memoryFiles.length === 0) return false;
	mkdirSync(dir, { recursive: true });
	for (const src of memoryFiles) {
		if (!existsSync(src) || !statSync(src).isFile()) continue;
		copyFileSync(src, join(dir, basename(src)));
	}
	return true;
}
