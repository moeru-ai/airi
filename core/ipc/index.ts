/**
 * AIRI IPC — Barrel Export
 *
 * Public API for the IPC subsystem: message protocol, transport interfaces,
 * and local socket transport implementation.
 */

// ── Protocol ──────────────────────────────────────────────────────────

export {
  LocalSocketClientTransport,
  LocalSocketServerTransport,
} from './local-socket/index.js'

export type { LocalSocketClientOptions } from './local-socket/index.js'

// ── Transport interfaces ──────────────────────────────────────────────

export type {
  IpcErrorMessage,
  IpcEventMessage,
  IpcMessage,
  IpcMessageBase,
  IpcMessageType,
  IpcPingMessage,
  IpcPongMessage,
  IpcRequestMessage,
  IpcResponseMessage,
} from './protocol.js'

export { deserializeMessage, serializeMessage } from './protocol.js'

// ── Local socket transport ────────────────────────────────────────────

export type {
  IpcClientTransport,
  IpcConnectionState,
  IpcMessageHandler,
  IpcRequestOptions,
  IpcServerTransport,
  IpcStateHandler,
} from './transport.js'

export { generateId, request } from './transport.js'
