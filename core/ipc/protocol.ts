/**
 * AIRI IPC — Message Protocol
 *
 * Transport-independent message envelopes for daemon ↔ frontend communication.
 * All messages are plain objects — serialization-safe (JSON-compatible) and
 * future-compatible (unknown fields are ignored by consumers).
 *
 * Every message carries a unique `id` and a `timestamp`. Request/response pairs
 * share a `correlationId` so that the requester can match replies even under
 * concurrent load.
 */

// ── Message type discriminants ────────────────────────────────────────

export type IpcMessageType =
	| "event"
	| "request"
	| "response"
	| "error"
	| "ping"
	| "pong"

// ── Base envelope ─────────────────────────────────────────────────────

/**
 * Base fields present on every IPC message.
 *
 * New fields should be added here only if they are truly universal.
 * Payload-specific data belongs in the concrete message types.
 */
export interface IpcMessageBase {
	/** Unique message identifier (UUID v4). */
	readonly id: string

	/** Discriminant — determines which concrete type to use. */
	readonly type: IpcMessageType

	/** ISO-8601 timestamp of when the message was created. */
	readonly timestamp: string
}

// ── Event message ─────────────────────────────────────────────────────

/**
 * Wraps an AiriEvent for transport across the IPC boundary.
 *
 * The daemon broadcasts these to all connected clients whenever an
 * event is emitted on its EventBus.
 */
export interface IpcEventMessage extends IpcMessageBase {
	readonly type: "event"

	/** The AIRI event payload (discriminated union). */
	readonly payload: Record<string, unknown>
}

// ── Request message ───────────────────────────────────────────────────

/**
 * A request from client to daemon (or daemon to client).
 *
 * The `method` field names the operation (e.g. "module.list",
 * "runtime.status"). The `params` field carries method-specific input.
 *
 * The receiver must respond with an IpcResponseMessage or IpcErrorMessage
 * carrying the same `correlationId`.
 */
export interface IpcRequestMessage extends IpcMessageBase {
	readonly type: "request"

	/** Matches the `id` of the corresponding request. */
	readonly correlationId: string

	/** Operation name (e.g. "module.list", "runtime.status"). */
	readonly method: string

	/** Method-specific input parameters. */
	readonly params?: Record<string, unknown>
}

// ── Response message ──────────────────────────────────────────────────

/**
 * Successful response to a request.
 *
 * `correlationId` matches the `id` of the corresponding IpcRequestMessage.
 */
export interface IpcResponseMessage extends IpcMessageBase {
	readonly type: "response"

	/** Matches the `id` of the corresponding request. */
	readonly correlationId: string

	/** Operation-specific result data. */
	readonly result: unknown
}

// ── Error message ─────────────────────────────────────────────────────

/**
 * Error response to a request, or an out-of-band error notification.
 *
 * When sent as a response, `correlationId` matches the request's `id`.
 * When sent out-of-band, `correlationId` may be empty.
 */
export interface IpcErrorMessage extends IpcMessageBase {
	readonly type: "error"

	/** Matches the `id` of the corresponding request, if any. */
	readonly correlationId?: string

	/** Machine-readable error code (e.g. "MODULE_NOT_FOUND"). */
	readonly code: string

	/** Human-readable error description. */
	readonly message: string

	/** Optional structured error details. */
	readonly details?: Record<string, unknown>
}

// ── Heartbeat messages ────────────────────────────────────────────────

/**
 * Ping message — used as a heartbeat keepalive.
 *
 * The receiver should respond with an IpcPongMessage carrying the same `id`.
 */
export interface IpcPingMessage extends IpcMessageBase {
	readonly type: "ping"
}

/**
 * Pong message — response to a ping.
 */
export interface IpcPongMessage extends IpcMessageBase {
	readonly type: "pong"

	/** Matches the `id` of the corresponding ping. */
	readonly correlationId: string
}

// ── Union type ────────────────────────────────────────────────────────

/**
 * Discriminated union of all IPC message types.
 *
 * Consumers narrow via the `type` field:
 *
 * ```ts
 * function handle(msg: IpcMessage) {
 *   switch (msg.type) {
 *     case "event":    // msg is IpcEventMessage
 *     case "request":  // msg is IpcRequestMessage
 *     case "response": // msg is IpcResponseMessage
 *     case "error":    // msg is IpcErrorMessage
 *   }
 * }
 * ```
 */
export type IpcMessage =
	| IpcEventMessage
	| IpcRequestMessage
	| IpcResponseMessage
	| IpcErrorMessage
	| IpcPingMessage
	| IpcPongMessage

// ── Serialization helpers ─────────────────────────────────────────────

/**
 * Serialize an IPC message to a JSON string.
 *
 * Uses JSON.stringify — all message fields must be JSON-serializable.
 * Date objects are expected to be stored as ISO-8601 strings already.
 */
export function serializeMessage(msg: IpcMessage): string {
	return JSON.stringify(msg)
}

/**
 * Deserialize a JSON string into an IPC message.
 *
 * Returns null if the input is not valid JSON or does not conform to
 * the IpcMessage shape (missing required fields or unknown type).
 */
export function deserializeMessage(raw: string): IpcMessage | null {
	try {
		const parsed = JSON.parse(raw) as unknown
		if (!isValidMessage(parsed)) return null
		return parsed
	} catch {
		return null
	}
}

// ── Type guard ────────────────────────────────────────────────────────

function isValidMessage(value: unknown): value is IpcMessage {
	if (typeof value !== "object" || value === null) return false

	const obj = value as Record<string, unknown>

	if (typeof obj["id"] !== "string") return false
	if (typeof obj["type"] !== "string") return false
	if (typeof obj["timestamp"] !== "string") return false

	const validTypes: string[] = [
		"event",
		"request",
		"response",
		"error",
		"ping",
		"pong",
	]

	return validTypes.includes(obj["type"])
}
