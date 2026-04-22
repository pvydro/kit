/**
 * MCP → kit tool adapter. Built as an ExtensionFactory so MCP-advertised tools
 * land in the same tool registry as built-in tools (bash/read/edit/etc).
 *
 * Flow at startup:
 *   1. connectAllMcpServers() spawns the subprocesses declared in the profile.
 *   2. For each advertised tool, call api.registerTool() with a wrapper that
 *      forwards the model's arguments to client.callTool() and returns the
 *      MCP response as an AgentToolResult.
 *   3. Register a session_shutdown listener that closes all clients.
 *
 * Reconnect: on a tool call that fails due to a closed transport, we attempt
 * one reconnect (new transport + client, re-list tools) and retry the call.
 * A second failure propagates. Per vault: simple restart, backoff later.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import chalk from "chalk";
import type { ExtensionAPI, ExtensionFactory } from "../core/extensions/types.js";
import type { ConnectedMcpServer } from "./mcp-spawn.js";
import { connectAllMcpServers, connectMcpServer } from "./mcp-spawn.js";
import type { McpServerDecl } from "./spec.js";

type McpToolCallResult = AgentToolResult<Record<string, never>>;

/**
 * Build an ExtensionFactory that spawns the declared MCP servers and exposes
 * their tools to the agent's tool list.
 */
export function createMcpExtensionFactory(decls: McpServerDecl[]): ExtensionFactory {
	return async (api: ExtensionAPI): Promise<void> => {
		const servers = await connectAllMcpServers(decls, (decl, err) => {
			const detail = err instanceof Error ? err.message : String(err);
			console.error(chalk.yellow(`[kit] MCP server "${decl.name}" failed to connect: ${detail}`));
		});

		for (const server of servers) {
			for (const tool of server.tools) {
				registerMcpTool(api, server, tool.name);
			}
		}

		if (servers.length > 0) {
			const summary = servers.map((s) => `${s.name} (${s.tools.length} tools)`).join(", ");
			console.error(chalk.dim(`[kit] Registered MCP tools from: ${summary}`));
		}

		api.on("session_shutdown", async () => {
			await Promise.all(
				servers.map((s) =>
					s.client.close().catch((err: unknown) => {
						const detail = err instanceof Error ? err.message : String(err);
						console.error(chalk.dim(`[kit] MCP server "${s.name}" close errored: ${detail}`));
					}),
				),
			);
		});
	};
}

/**
 * Register a single MCP-advertised tool with kit's ExtensionAPI. The resulting
 * tool is named `<server>:<tool>` to avoid collisions with built-ins.
 */
function registerMcpTool(api: ExtensionAPI, server: ConnectedMcpServer, toolName: string): void {
	const tool = server.tools.find((t) => t.name === toolName);
	const description = tool?.description ?? `(via MCP server "${server.name}")`;
	const inputSchema = (tool?.inputSchema as object | undefined) ?? { type: "object" };
	const qualifiedName = `${server.name}:${toolName}`;

	api.registerTool({
		name: qualifiedName,
		label: qualifiedName,
		description,
		parameters: Type.Unsafe<Record<string, unknown>>(inputSchema),
		execute: async (_toolCallId, params, signal) => {
			const args = (params ?? {}) as Record<string, unknown>;
			return await callWithRetry(server, toolName, args, signal);
		},
	});
}

/**
 * Call an MCP tool with one reconnect attempt on disconnect. The MCP SDK's
 * callTool accepts an AbortSignal via the third options argument.
 */
async function callWithRetry(
	server: ConnectedMcpServer,
	toolName: string,
	args: Record<string, unknown>,
	signal: AbortSignal | undefined,
): Promise<McpToolCallResult> {
	try {
		const result = await server.client.callTool({ name: toolName, arguments: args }, undefined, { signal });
		return toAgentToolResult(result.content);
	} catch (err) {
		if (!looksLikeDisconnect(err)) throw err;
		console.error(chalk.yellow(`[kit] MCP server "${server.name}" disconnected; reconnecting once`));
		await reconnectServer(server);
		const result = await server.client.callTool({ name: toolName, arguments: args }, undefined, { signal });
		return toAgentToolResult(result.content);
	}
}

function toAgentToolResult(content: unknown): McpToolCallResult {
	const blocks = Array.isArray(content) ? content : [];
	return {
		content: blocks as (ImageContent | TextContent)[],
		details: {},
	};
}

/**
 * Re-spawn the subprocess and re-connect the client, mutating the server
 * handle in place. Old client is closed best-effort. Tool list is refreshed.
 */
async function reconnectServer(server: ConnectedMcpServer): Promise<void> {
	await server.client.close().catch(() => {});
	const fresh = await connectMcpServer(server.decl);
	server.client = fresh.client;
	server.tools = fresh.tools;
}

/**
 * Heuristic for detecting disconnect vs genuine tool errors. MCP SDK surfaces
 * transport closure as errors with "closed" / "EPIPE" / "ECONNRESET" in the
 * message. Tool-level errors come back as CallToolResult.isError or structured
 * McpError codes, not thrown; so anything thrown from callTool we treat as
 * transport unless it's clearly a typed error.
 */
function looksLikeDisconnect(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const msg = err.message.toLowerCase();
	return (
		msg.includes("closed") ||
		msg.includes("epipe") ||
		msg.includes("econnreset") ||
		msg.includes("disconnected") ||
		msg.includes("transport")
	);
}
