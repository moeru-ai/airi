/**
 * AIRI Runtime Client — Transport-Agnostic Interface
 *
 * Defines the contract for communicating with an external AIRI runtime
 * (e.g. a detached server process, a cloud agent, or a local in-process bus).
 *
 * This is an abstraction layer only. No WebSocket, gRPC, or stdio
 * implementation lives here. Concrete transports implement this interface
 * and are injected at startup.
 *
 * The interface is intentionally small: connect/disconnect lifecycle,
 * one-way send, and subscription. Request/response patterns are built
 * on top of send + subscribe by higher-level code.
 */

/**
 * Connection state of the runtime client.
 */
export type RuntimeConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "error"

/**
 * Handler for inbound messages from the runtime.
 */
export type RuntimeMessageHandler = (channel: string, payload: unknown) => void

/**
 * Handler for connection state changes.
 */
export type RuntimeStateHandler = (state: RuntimeConnectionState, error?: string) => void

/**
 * Transport-agnostic runtime client interface.
 *
 * Implementations must be safe to call from any module. Methods should
 * never throw on the caller's stack — errors are surfaced via state
 * change callbacks or rejected promises.
 */
export interface RuntimeClient {
	// ── Lifecycle ─────────────────────────────────────────────────────

	/**
	 * Establish the underlying transport connection.
	 *
	 * Resolves when the connection is ready to send/receive.
	 * Rejects if the connection cannot be established.
	 *
	 * Idempotent: calling connect() while already connected is a no-op.
	 */
	connect(): Promise<void>

	/**
	 * Gracefully tear down the connection.
	 *
	 * After disconnect() resolves, the client may be reconnected via connect().
	 * Pending sends are rejected. Active subscriptions are silently removed.
	 *
	 * Idempotent: calling disconnect() while already disconnected is a no-op.
	 */
	disconnect(): Promise<void>

	// ── Messaging ─────────────────────────────────────────────────────

	/**
	 * Send a message through the runtime on a logical channel.
	 *
	 * The channel is an opaque string — the transport decides how to map it
	 * (e.g. a WebSocket topic, a gRPC stream name, a IPC pipe).
	 *
	 * Serialization of the payload is the implementer's responsibility.
	 * The caller passes a plain object; the transport may serialize to JSON,
	 * MessagePack, protobuf, etc.
	 *
	 * @param channel - Logical channel / topic name.
	 * @param payload - Data to send (must be serializable by the transport).
	 *
	 * Rejects if the client is not connected or the send fails.
	 */
	send(channel: string, payload: unknown): Promise<void>

	/**
	 * Subscribe to messages on a logical channel.
	 *
	 * The handler is invoked for every inbound message on the given channel.
	 * Multiple subscribers on the same channel are all notified (pub/sub).
	 *
	 * @param channel - Logical channel / topic name.
	 * @param handler - Callback invoked for each inbound message.
	 * @returns A function that unsubscribes the handler when called.
	 */
	subscribe(channel: string, handler: RuntimeMessageHandler): () => void

	// ── State ─────────────────────────────────────────────────────────

	/**
	 * Current connection state.
	 */
	readonly state: RuntimeConnectionState

	/**
	 * Register a callback for connection state changes.
	 *
	 * The handler fires whenever the state machine transitions, including
	 * connection errors. This is the primary way to surface transport-level
	 * issues to the rest of the system.
	 *
	 * @returns An unsubscribe function.
	 */
	onStateChange(handler: RuntimeStateHandler): () => void
}
