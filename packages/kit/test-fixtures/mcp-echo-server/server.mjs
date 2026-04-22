#!/usr/bin/env node
// Minimal stdio MCP server for kit smoke tests.
// Exposes one tool: `ping(message: string) -> "echo: <message>"`.
// Relies on @modelcontextprotocol/sdk hoisted to the repo root's node_modules.
// Invoke from repo root: node packages/kit/test-fixtures/mcp-echo-server/server.mjs

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
	{ name: "kit-test-echo", version: "0.0.1" },
	{ capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "ping",
			description: "Echoes the input message back as 'echo: <message>'",
			inputSchema: {
				type: "object",
				properties: {
					message: { type: "string", description: "Message to echo" },
				},
				required: ["message"],
			},
		},
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const args = request.params.arguments ?? {};
	const message = typeof args.message === "string" ? args.message : "";
	return { content: [{ type: "text", text: `echo: ${message}` }] };
});

await server.connect(new StdioServerTransport());
