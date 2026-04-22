/**
 * Persistent memory tools: `remember`, `recall`, `memory_list`.
 *
 * Factory is always installed (even without a profile). If a profile is loaded
 * and the user's memory dir doesn't exist yet, seed from profile.memoryFiles.
 *
 * All three tools operate on `~/.kit/memory/` via memory-store.ts.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionFactory } from "../core/extensions/types.js";
import { type MemoryType, readMemoryIndex, searchMemory, updateMemoryIndex, writeMemoryEntry } from "./memory-store.js";

const TYPE_UNION = Type.Union([
	Type.Literal("user"),
	Type.Literal("feedback"),
	Type.Literal("project"),
	Type.Literal("reference"),
]);

export function createMemoryExtensionFactory(): ExtensionFactory {
	return (api: ExtensionAPI): void => {
		api.registerTool({
			name: "remember",
			label: "Remember",
			description:
				"Save a note to persistent memory at ~/.kit/memory/. Use when the user corrects you, when a decision is made, or when you learn a non-obvious pattern worth recalling in future sessions.",
			parameters: Type.Object({
				topic: Type.String({
					description: "Short title — becomes the filename slug and 'name' in YAML frontmatter",
				}),
				content: Type.String({
					description:
						"Markdown body. If description is empty, the first non-empty line is used as description automatically.",
				}),
				type: TYPE_UNION,
			}),
			execute: async (_toolCallId, params) => {
				const { topic, content, type } = params as { topic: string; content: string; type: MemoryType };
				const { path, frontmatter } = writeMemoryEntry({ topic, content, type });
				updateMemoryIndex({ path, frontmatter, body: content });
				return {
					content: [
						{ type: "text", text: `Saved memory entry.\nPath: ${path}\nDescription: ${frontmatter.description}` },
					],
					details: {},
				};
			},
		});

		api.registerTool({
			name: "recall",
			label: "Recall",
			description:
				"Search persistent memory (case-insensitive keyword match across name, description, and body). Returns top N ranked matches with 200-char previews.",
			parameters: Type.Object({
				query: Type.String({ description: "Keywords to search for" }),
				limit: Type.Optional(Type.Number({ description: "Max matches to return (default 5)" })),
			}),
			execute: async (_toolCallId, params) => {
				const { query, limit } = params as { query: string; limit?: number };
				const results = searchMemory(query, limit ?? 5);
				if (results.length === 0) {
					return { content: [{ type: "text", text: "No matching memory entries." }], details: {} };
				}
				const rendered = results
					.map(
						({ entry, score }) =>
							`[${entry.frontmatter.type}] ${entry.frontmatter.name} (score ${score})\n${entry.path}\n${entry.body.slice(0, 200)}`,
					)
					.join("\n\n---\n\n");
				return { content: [{ type: "text", text: rendered }], details: {} };
			},
		});

		api.registerTool({
			name: "memory_list",
			label: "Memory List",
			description:
				"Return the MEMORY.md index verbatim. Useful when you need a full catalog of saved memory entries.",
			parameters: Type.Object({}),
			execute: async () => {
				const idx = readMemoryIndex();
				return {
					content: [{ type: "text", text: idx || "No memory index yet." }],
					details: {},
				};
			},
		});
	};
}
