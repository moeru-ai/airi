/**
 * Client connection lifecycle state.
 *
 * `preparing` means the transport is open while caller-owned bootstrap work can
 * still run. `ready` means normal application sends are allowed. `failed` means
 * the client reached a terminal failure instead of a clean close.
 */
export type WsState
  = | 'idle'
    | 'connecting'
    | 'open'
    | 'preparing'
    | 'ready'
    | 'reconnecting'
    | 'closing'
    | 'closed'
    | 'failed'

/**
 * Result returned by best-effort send operations.
 *
 * Use when:
 * - Callers need a stable result instead of runtime-specific WebSocket return values
 * - Adapters may report backpressure, closed sockets, or thrown send errors differently
 *
 * Expects:
 * - `ok: false` means the message was not accepted by the local runtime
 *
 * Returns:
 * - A transport-neutral send result for client, peer, and broadcast calls
 */
export interface WsSendResult {
  /** Whether the local runtime accepted the outgoing message. */
  ok: boolean
  /** Optional stable reason for rejected local sends. */
  reason?: 'closed' | 'backpressure' | 'error'
  /** Original error when the adapter threw during send. */
  error?: unknown
}

/**
 * Describes a websocket close notification without exposing a concrete runtime type.
 */
export interface WsCloseDetails {
  /** WebSocket close code when one is available. */
  code?: number
  /** WebSocket close reason when one is available. */
  reason?: string
  /** Whether the runtime considered the close clean. */
  wasClean?: boolean
}

/**
 * Converts runtime-specific send return values into a stable public result.
 *
 * Use when:
 * - Client and server adapters expose different send result semantics
 * - Public APIs need to avoid leaking concrete runtime return values
 *
 * Expects:
 * - `false` from an adapter means local backpressure or rejected send
 *
 * Returns:
 * - A normalized send result.
 */
export function normalizeSendResult(run: () => boolean | number | void): WsSendResult {
  try {
    const result = run()
    if (result === false) {
      return { ok: false, reason: 'backpressure' }
    }

    return { ok: true }
  }
  catch (error) {
    return { ok: false, reason: 'error', error }
  }
}

export * from './utils'
