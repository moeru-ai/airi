/**
 * AIRI Core — Persistent Session Types
 *
 * Defines the data model for sessions that survive daemon restarts.
 * Unlike the in-memory SessionManager, persistent sessions are
 * stored durably and support reconnection via recovery tokens.
 *
 * Design principles:
 * - Branded ID for type safety (PersistentSessionId).
 * - Sessions survive frontend disconnects — only destroyed on
 *   explicit cleanup or expiry.
 * - Recovery tokens enable session resumption across connection boundaries.
 */

import type { SessionState } from "../runtime/session.js"

// ── Branded ID ──────────────────────────────────────────────────────────

/**
 * Opaque persistent session identifier.
 *
 * Unlike the in-memory session ID, this ID is stable across daemon
 * restarts and can be used for session resumption.
 */
export type PersistentSessionId = string & { readonly __brand: 'PersistentSessionId' }

/**
 * Create a PersistentSessionId from a raw string.
 */
export function createPersistentSessionId(raw: string): PersistentSessionId {
	return raw as PersistentSessionId
}

// ── Persistent session ──────────────────────────────────────────────────

/**
 * A session that persists across daemon restractions.
 *
 * Sessions are created when a client connects and survive disconnection.
 * They are only destroyed explicitly or after expiry.
 */
export interface PersistentSession {
	/** Unique persistent session identifier. */
	readonly id: PersistentSessionId

	/** Transport-level client ID. */
	readonly clientId: string

	/** Current lifecycle state. */
	readonly state: SessionState

	/** ISO-8601 timestamp of when the session was created. */
	readonly createdAt: string

	/** ISO-8601 timestamp of the last state change. */
	readonly updatedAt: string

	/** ISO-8601 timestamp of the last client connection, if any. */
	readonly lastConnectedAt?: string

	/** Opaque client metadata. */
	readonly clientInfo: Record<string, unknown>

	/** Whether the session is detached (client disconnected). */
	readonly isDetached: boolean

	/**
	 * Recovery token for session resumption.
	 * Set when the session is detached; used by resumeSession() to
	 * reconnect the same session.
	 */
	readonly recoveryToken?: string
}

// ── Session ownership ───────────────────────────────────────────────────

/**
 * Tracks which process owns a session.
 *
 * Used for session affinity in future distributed scenarios.
 * Currently, only one process (the daemon) owns all sessions.
 */
export interface SessionOwnership {
	/** The session being owned. */
	readonly sessionId: PersistentSessionId

	/** The process ID that owns this session. */
	readonly ownerProcessId: number

	/** ISO-8601 timestamp of when ownership was acquired. */
	readonly acquiredAt: string

	/** ISO-8601 timestamp of when ownership expires, if any. */
	readonly expiresAt?: string
}

// ── Session filter ──────────────────────────────────────────────────────

/**
 * Filter criteria for listing sessions.
 */
export interface SessionFilter {
	/** Filter by session state. */
	readonly state?: SessionState

	/** Filter by client ID. */
	readonly clientId?: string

	/**
	 * Filter by active status.
	 * - true: only connected (attached) sessions.
	 * - false: only detached sessions.
	 * - undefined: all sessions.
	 */
	readonly active?: boolean
}

// ── Session reconnect result ────────────────────────────────────────────

/**
 * Result of a session reconnection attempt.
 */
export interface SessionReconnectResult {
	/** The reconnected session. */
	readonly session: PersistentSession

	/** Whether the session was successfully resumed. */
	readonly resumed: boolean

	/**
	 * Number of events that were missed while the session was detached.
	 * These can be replayed to bring the client up to date.
	 */
	readonly missedEvents: number
}
