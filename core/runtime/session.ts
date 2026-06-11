/**
 * AIRI Core — Runtime Session Model
 *
 * Tracks client connections to the daemon. Each connected frontend/desktop
 * client gets a session. Sessions are lightweight — no persistence, no
 * authentication yet.
 *
 * Design decisions:
 * - Sessions are owned by the daemon. When a client disconnects, its
 *   session is marked detached but retained briefly for reconnection.
 * - No persistence: sessions live in memory and are lost on daemon restart.
 * - Session IDs are unique per connection epoch — reconnecting creates a
 *   new session.
 */

// ── Session state ─────────────────────────────────────────────────────

/**
 * Lifecycle states for a client session.
 */
export type SessionState =
	| "attaching"
	| "attached"
	| "detaching"
	| "detached"

// ── Session interface ─────────────────────────────────────────────────

/**
 * Represents a single client connection to the daemon.
 */
export interface Session {
	/** Unique session identifier. */
	readonly sessionId: string

	/** Transport-level client ID (assigned by the IPC transport). */
	readonly clientId: string

	/** Current lifecycle state. */
	readonly state: SessionState

	/** ISO-8601 timestamp of when the session was created. */
	readonly createdAt: string

	/** ISO-8601 timestamp of the last state change. */
	readonly updatedAt: string

	/** Whether the client is currently connected. */
	readonly isConnected: boolean

	/**
	 * Opaque client metadata (e.g. client name, version, platform).
	 * Set by the client during the initial handshake.
	 */
	readonly clientInfo: Record<string, unknown>
}

// ── Session manager ───────────────────────────────────────────────────

/**
 * Manages client sessions for the daemon.
 *
 * Tracks which clients are connected, handles attachment/detachment,
 * and provides introspection into the current session set.
 */
export class SessionManager {
	private readonly sessions = new Map<string, Session>()

	// ── Lifecycle ─────────────────────────────────────────────────────

	/**
	 * Create a new session for a connecting client.
	 *
	 * The session starts in "attaching" state and should be transitioned
	 * to "attached" once the client completes its handshake.
	 *
	 * @param clientId - The transport-level client identifier.
	 * @param clientInfo - Optional client metadata.
	 *
	 * @returns The newly created session.
	 */
	attach(
		clientId: string,
		clientInfo: Record<string, unknown> = {},
	): Session {
		const now = new Date().toISOString()
		const session: Session = {
			sessionId: generateSessionId(),
			clientId,
			state: "attaching",
			createdAt: now,
			updatedAt: now,
			isConnected: true,
			clientInfo,
		}

		this.sessions.set(session.sessionId, session)
		return session
	}

	/**
	 * Mark a session as fully attached (handshake complete).
	 *
	 * @param sessionId - The session to transition.
	 *
	 * @returns The updated session, or undefined if not found.
	 */
	markAttached(sessionId: string): Session | undefined {
		return this.updateState(sessionId, "attached")
	}

	/**
	 * Mark a session as disconnected.
	 *
	 * The session is retained in "detached" state for potential
	 * reconnection. Call cleanupDetached() to remove stale sessions.
	 *
	 * @param sessionId - The session to detach.
	 *
	 * @returns The updated session, or undefined if not found.
	 */
	detach(sessionId: string): Session | undefined {
		const session = this.sessions.get(sessionId)
		if (!session) return undefined

		const updated: Session = {
			...session,
			state: "detached",
			isConnected: false,
			updatedAt: new Date().toISOString(),
		}

		this.sessions.set(sessionId, updated)
		return updated
	}

	/**
	 * Remove all detached sessions from the manager.
	 *
	 * @returns The number of sessions removed.
	 */
	cleanupDetached(): number {
		let count = 0
		for (const [id, session] of this.sessions) {
			if (session.state === "detached") {
				this.sessions.delete(id)
				count++
			}
		}
		return count
	}

	// ── Query ─────────────────────────────────────────────────────────

	/**
	 * Get a session by its ID.
	 */
	get(sessionId: string): Session | undefined {
		return this.sessions.get(sessionId)
	}

	/**
	 * Get the session associated with a transport client ID.
	 */
	getByClientId(clientId: string): Session | undefined {
		for (const session of this.sessions.values()) {
			if (session.clientId === clientId) return session
		}
		return undefined
	}

	/**
	 * Return all sessions, optionally filtered by state.
	 */
	all(filterState?: SessionState): Session[] {
		const all = [...this.sessions.values()]
		if (!filterState) return all
		return all.filter((s) => s.state === filterState)
	}

	/**
	 * Return only currently connected (attached) sessions.
	 */
	connected(): Session[] {
		return this.all("attached")
	}

	/**
	 * Return the total number of sessions.
	 */
	count(): number {
		return this.sessions.size
	}

	// ── Private ───────────────────────────────────────────────────────

	private updateState(
		sessionId: string,
		newState: SessionState,
	): Session | undefined {
		const session = this.sessions.get(sessionId)
		if (!session) return undefined

		const updated: Session = {
			...session,
			state: newState,
			updatedAt: new Date().toISOString(),
		}

		this.sessions.set(sessionId, updated)
		return updated
	}
}

// ── ID generation ─────────────────────────────────────────────────────

/**
 * Generate a unique session identifier.
 */
function generateSessionId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return `sess_${crypto.randomUUID()}`
	}

	return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
