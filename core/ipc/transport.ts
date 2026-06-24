/**
 * AIRI IPC — Transport Interfaces
 *
 * Defines the contract for bidirectional IPC communication between the
 * daemon process and frontend clients. Transports are responsible for
 * connection lifecycle, message framing, and error propagation.
 *
 * Design decisions:
 * - Interfaces are transport-agnostic: implementations may use Unix domain
 *   sockets, named pipes, TCP, or even in-process channels.
 * - Request/response is built on top of send + correlation IDs from
 *   protocol.ts — the transport itself is fire-and-forget.
 * - All async methods reject on unrecoverable errors; transient failures
 *   are surfaced via state change callbacks.
 */

import type { IpcMessage } from "./protocol.js"

// ── Connection state ──────────────────────────────────────────────────

/**
 * Lifecycle states for an IPC transport connection.
 */
export type IpcConnectionState =
	| "idle"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "disconnecting"
	| "disconnected"
	| "error"

// ── Handler types ─────────────────────────────────────────────────────

/**
 * Callback invoked when a message is received from the remote side.
 */
export type IpcMessageHandler = (message: IpcMessage) => void

/**
 * Callback invoked when the connection state changes.
 */
export type IpcStateHandler = (state: IpcConnectionState, error?: string) => void

// ── Server-side transport ─────────────────────────────────────────────

/**
 * Server-side IPC transport.
 *
 * The daemon creates a server transport, starts listening for client
 * connections, and broadcasts events to all connected clients.
 *
 * Lifecycle: start → (clients connect/disconnect)* → stop
 */
export interface IpcServerTransport {
	/**
	 * Current lifecycle state of the server.
	 *
	 * Starts as "idle", transitions to "connected" when start() resolves,
	 * and to "disconnected" when stop() resolves.
	 */
	readonly state: IpcConnectionState

	/**
	 * Start listening for client connections.
	 *
	 * Resolves when the server is ready to accept connections.
	 * Rejects if the server cannot bind (e.g. port in use, permission error).
	 *
	 * Idempotent: calling start() while already started is a no-op.
	 */
	start(): Promise<void>

	/**
	 * Stop listening and disconnect all clients.
	 *
	 * Resolves when the server has fully shut down and released resources.
	 * Pending sends may be rejected.
	 *
	 * Idempotent: calling stop() while already stopped is a no-op.
	 */
	stop(): Promise<void>

	/**
	 * Send a message to a specific connected client.
	 *
	 * @param clientId - Unique identifier for the target client.
	 * @param message - The IPC message to send.
	 *
	 * Rejects if the client is not connected or the send fails.
	 */
	send(clientId: string, message: IpcMessage): Promise<void>

	/**
	 * Broadcast a message to all connected clients.
	 *
	 * Failures to individual clients are silently dropped — the broadcast
	 * itself resolves once all sends have been attempted.
	 *
	 * @param message - The IPC message to broadcast.
	 */
	broadcast(message: IpcMessage): Promise<void>

	/**
	 * Register a handler for incoming messages from clients.
	 *
	 * The handler is invoked for every message received from any connected
	 * client. The `clientId` parameter identifies the sender.
	 *
	 * @returns An unsubscribe function.
	 */
	onMessage(handler: (clientId: string, message: IpcMessage) => void): () => void

	/**
	 * Register a handler for client connection events.
	 *
	 * Fired when a new client successfully connects and is ready to
	 * exchange messages.
	 *
	 * @returns An unsubscribe function.
	 */
	onClientConnect(handler: (clientId: string) => void): () => void

	/**
	 * Register a handler for client disconnection events.
	 *
	 * Fired when a client disconnects, either gracefully or due to error.
	 *
	 * @returns An unsubscribe function.
	 */
	onClientDisconnect(handler: (clientId: string) => void): () => void

	/**
	 * Register a handler for server state changes.
	 *
	 * @returns An unsubscribe function.
	 */
	onStateChange(handler: IpcStateHandler): () => void

	/**
	 * Return the set of currently connected client IDs.
	 */
	connectedClients(): string[]
}

// ── Client-side transport ─────────────────────────────────────────────

/**
 * Client-side IPC transport.
 *
 * Desktop/frontend clients create a client transport to connect to the
 * daemon's server transport.
 *
 * Lifecycle: connect → (send/receive)* → disconnect
 */
export interface IpcClientTransport {
	/**
	 * Current lifecycle state of the client connection.
	 */
	readonly state: IpcConnectionState

	/**
	 * Connect to the daemon's IPC server.
	 *
	 * Resolves when the connection is established and ready for messaging.
	 * Rejects if the connection cannot be established.
	 *
	 * Idempotent: calling connect() while already connected is a no-op.
	 */
	connect(): Promise<void>

	/**
	 * Disconnect from the daemon.
	 *
	 * Resolves when the connection is fully closed.
	 * Pending sends may be rejected.
	 *
	 * Idempotent: calling disconnect() while already disconnected is a no-op.
	 */
	disconnect(): Promise<void>

	/**
	 * Send a message to the daemon.
	 *
	 * Rejects if not connected or the send fails.
	 */
	send(message: IpcMessage): Promise<void>

	/**
	 * Register a handler for incoming messages from the daemon.
	 *
	 * @returns An unsubscribe function.
	 */
	onMessage(handler: IpcMessageHandler): () => void

	/**
	 * Register a handler for disconnection events.
	 *
	 * Fired when the connection is lost, either by the client calling
	 * disconnect() or by the server closing the connection.
	 *
	 * @returns An unsubscribe function.
	 */
	onDisconnect(handler: () => void): () => void

	/**
	 * Register a handler for connection state changes.
	 *
	 * @returns An unsubscribe function.
	 */
	onStateChange(handler: IpcStateHandler): () => void
}

// ── Request/response helper ───────────────────────────────────────────

/**
 * Options for the request/response helper.
 */
export interface IpcRequestOptions {
	/** Maximum time (ms) to wait for a response before rejecting. @default 30_000 */
	timeout?: number
}

/**
 * Send a request and wait for the corresponding response.
 *
 * Builds on top of IpcClientTransport by correlating request/response
 * via the message protocol's correlationId field.
 *
 * @param transport - The client transport to send through.
 * @param method - The RPC method name.
 * - The request's `id` is used as the `correlationId` in the response.
 * @param params - Optional method parameters.
 * @param options - Request options (timeout).
 *
 * @returns The response result.
 *
 * @throws If the transport is not connected, the send fails, or the
 *         timeout is exceeded.
 *
 * @example
 * ```ts
 * const result = await request(clientTransport, "module.list")
 * // result is the deserialized response result
 * ```
 */
export function request(
	transport: IpcClientTransport,
	method: string,
	params?: Record<string, unknown>,
	options: IpcRequestOptions = {},
): Promise<unknown> {
	const timeout = options.timeout ?? 30_000

	if (transport.state !== "connected") {
		throw new Error(`Cannot send request: transport is ${transport.state}.`)
	}

	const id = generateId()
	const correlationId = id

	return new Promise<unknown>((resolve, reject) => {
		let settled = false
		let unsubscribe: (() => void) | undefined

		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			unsubscribe?.()
			reject(new Error(`Request "${method}" timed out after ${timeout}ms.`))
		}, timeout)

		unsubscribe = transport.onMessage((msg) => {
			if (msg.type === "response" && msg.correlationId === correlationId) {
				settled = true
				unsubscribe()
				clearTimeout(timer)
				resolve(msg.result)
			}
			if (msg.type === "error" && msg.correlationId === correlationId) {
				settled = true
				unsubscribe()
				clearTimeout(timer)
				reject(new Error(`${msg.code}: ${msg.message}`))
			}
		})

		transport
			.send({
				id,
				type: "request",
				timestamp: new Date().toISOString(),
				correlationId,
				method,
				params,
			})
			.catch((err) => {
				if (settled) return
				settled = true
				unsubscribe()
				clearTimeout(timer)
				reject(err)
			})
	})
}

// ── ID generation ─────────────────────────────────────────────────────

/**
 * Generate a unique message identifier.
 *
 * Uses crypto.randomUUID when available, falls back to a timestamp-based
 * pseudo-random string.
 */
export function generateId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID()
	}

	// Fallback for environments without crypto.randomUUID.
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
