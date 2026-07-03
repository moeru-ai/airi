/**
 * AIRI Core Terminal — Public API
 *
 * Exports for registering the `terminal` capability into AIRI's core
 * runtime and communicating with the PTY MCP server.
 */

export { resolveTerminalMcpOptions, TerminalMcpBridge } from './bridge.js'
export type { NormalizedToolError, TerminalMcpBridgeOptions, TerminalMcpToolSummary } from './bridge.js'
export { registerTerminalCapability, TERMINAL_CAPABILITY_ID } from './capability.js'
export type { RegisteredTerminalCapability, RegisterTerminalCapabilityOptions } from './capability.js'
export { buildZodSchema, clearToolSchemaCache, createTerminalToolHandler, getToolSchema } from './handler.js'
export { tryRegisterTerminalCapability } from './runtime-entrypoint.js'
export type { TryRegisterOptions } from './runtime-entrypoint.js'
