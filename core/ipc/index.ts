/**
 * AIRI IPC — Barrel Export
 *
 * Public API for the IPC subsystem: message protocol, transport interfaces,
 * and local socket transport implementation.
 */

// ── Protocol ──────────────────────────────────────────────────────────

export type {
	IpcMessage,
	IpcMessageBase,
	IpcMessageType,
	IpcEventMessage,
	IpcRequestMessage,
	IpcResponseMessage,
	IpcErrorMessage,
	IpcPingMessage,
	IpcPongMessage,
} from "./protocol.js"

export { serializeMessage, deserializeMessage } from "./protocol.js"

// ── Transport interfaces ──────────────────────────────────────────────

export type {
	IpcConnectionState,
	IpcMessageHandler,
	IpcStateHandler,
	IpcServerTransport,
	IpcClientTransport,
	IpcRequestOptions,
} from "./transport.js"

export { request, generateId } from "./transport.js"

// ── Local socket transport ────────────────────────────────────────────

export {
	LocalSocketServerTransport,
	LocalSocketClientTransport,
} from "./local-socket/index.js"

export type { LocalSocketClientOptions } from "./local-socket/index.js"
