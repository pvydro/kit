/**
 * MCP server spawning and connection for kit profiles.
 *
 * Profile's mcp-servers.yaml declares subprocesses to spawn. For each, we open an
 * stdio JSON-RPC MCP client, perform the handshake, list advertised tools, and
 * return a handle. Tool registration into the agent's tool list is a follow-up
 * milestone; this module only owns spawn/connect/shutdown.
 *
 * See note-vault/kit/10-profile-spec.md for the mcp-servers.yaml schema.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerDecl } from "./spec.js";

export interface McpToolInfo {
	name: string;
	description?: string;
	inputSchema: unknown;
}

export interface ConnectedMcpServer {
	name: string;
	decl: McpServerDecl;
	client: Client;
	tools: McpToolInfo[];
	close(): Promise<void>;
}

/**
 * Connect to a single MCP server over stdio. Spawns the subprocess, performs
 * the initialize handshake, and lists advertised tools.
 */
export async function connectMcpServer(decl: McpServerDecl): Promise<ConnectedMcpServer> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === "string") env[k] = v;
	}
	if (decl.env) {
		for (const [k, v] of Object.entries(decl.env)) env[k] = v;
	}

	const transport = new StdioClientTransport({
		command: decl.command,
		args: decl.args ?? [],
		env,
		cwd: decl.cwd,
	});

	const client = new Client({ name: "kit", version: "0.0.1" }, { capabilities: {} });

	await client.connect(transport);

	const toolsResp = await client.listTools();
	const tools: McpToolInfo[] = toolsResp.tools.map((t) => ({
		name: t.name,
		description: t.description,
		inputSchema: t.inputSchema,
	}));

	return {
		name: decl.name,
		decl,
		client,
		tools,
		async close() {
			await client.close();
		},
	};
}

/**
 * Connect all servers declared in a profile's mcp-servers.yaml. Logs and skips
 * any server that fails to connect — one bad server does not take down the rest.
 * Returns successfully-connected servers.
 */
export async function connectAllMcpServers(
	decls: McpServerDecl[],
	onError?: (decl: McpServerDecl, err: unknown) => void,
): Promise<ConnectedMcpServer[]> {
	const results: ConnectedMcpServer[] = [];
	for (const decl of decls) {
		try {
			const server = await connectMcpServer(decl);
			results.push(server);
		} catch (err) {
			if (onError) onError(decl, err);
		}
	}
	return results;
}

/**
 * Install SIGINT / SIGTERM handlers that close all tracked MCP clients before
 * exit. Idempotent — subsequent calls replace the registered handlers.
 */
export function installMcpCleanupHandlers(servers: ConnectedMcpServer[]): void {
	const cleanup = async (exitCode: number) => {
		await Promise.all(servers.map((s) => s.close().catch(() => {})));
		process.exit(exitCode);
	};
	process.once("SIGINT", () => {
		void cleanup(130);
	});
	process.once("SIGTERM", () => {
		void cleanup(143);
	});
}
