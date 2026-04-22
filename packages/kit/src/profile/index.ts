export { createHooksExtensionFactory } from "./hooks-extension-factory.js";
export { loadProfile, ProfileLoadError } from "./loader.js";
export { createMcpExtensionFactory } from "./mcp-extension-factory.js";
export {
	type ConnectedMcpServer,
	connectAllMcpServers,
	connectMcpServer,
	installMcpCleanupHandlers,
	type McpToolInfo,
} from "./mcp-spawn.js";
export { createMemoryExtensionFactory } from "./memory-extension-factory.js";
export { bootstrapFromProfile, readMemoryIndex } from "./memory-store.js";
export { createSlashCommandsExtensionFactory } from "./slash-commands-extension-factory.js";
export * from "./spec.js";
export { type SubstitutionContext, substitute, substituteObject } from "./substitution.js";
