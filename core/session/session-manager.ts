/**
 * AIRI Core — Persistent Session Manager
 *
 * Manages sessions that survive daemon restarts. Unlike the in-memory
 * SessionManager, this manager supports session persistence, detachment,
 * reconnection, and expiry-based cleanup.
 *
 * Design decisions:
 * - Sessions survive frontend disconnects — only destroyed on explicit
 *   cleanup or expiry.
 * - Recovery tokens enable session resumption across connection boundaries.
 * - Detached sessions are retained for a configurable period before cleanup.
 */

import type {
	PersistentSession,
	PersistentSessionId,
	SessionFilter,
	SessionReconnectResult,
} from "./types.js"
import { createPersistentSessionId } from "./types.js"

// ── Utilities ────────────────────────────────────────────────────────────

/**
 * Generate a unique persistent session identifier.
 */
function generatePersistentSessionId(): PersistentSessionId {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return createPersistentSessionId(`psess_${crypto.randomUUID()}`)
	}
	return createPersistentSessionId(
		`psess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
	)
}

/**
 * Generate a recovery token for session resumption.
 */
function generateRecoveryToken(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return `rtok_${crypto.randomUUID()}`
	}
	return `rtok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// ── PersistentSessionManager ─────────────────────────────────────────────

/**
 * Manages persistent client sessions.
 *
 * Sessions survive daemon restarts and frontend disconnects.
 * Supports reconnection via recovery tokens and automatic cleanup
 * of stale detached sessions.
 */
export class PersistentSessionManager {
	private readonly sessions = new Map<string, PersistentSession>()


	/**
	 * Create a new PersistentSessionManager.
	 *
	 */
	constructor() {
	}

	// ── Lifecycle ────────────────────────────────────────────────────────

	/**
	 * Create a new persistent session for a connecting client.
	 *
	 * The session starts in "attaching" state and should be transitioned
	 * to "attached" once the client completes its handshake.
	 *
	 * @param clientId - The transport-level client identifier.
	 * @param clientInfo - Optional client metadata.
	 *
	 * @returns The newly created session.
	 */
	createSession(
		clientId: string,
		clientInfo: Record<string, unknown> = {},
	): PersistentSession {
		const now = new Date().toISOString()
		const session: PersistentSession = {
			id: generatePersistentSessionId(),
			clientId,
			state: "attaching",
			createdAt: now,
			updatedAt: now,
			clientInfo,
			isDetached: false,
		}

		this.sessions.set(session.id as string, session)
		return session
	}

	/**
	 * Mark a session as fully attached (handshake complete).
	 *
	 * @param sessionId - The session to transition.
	 *
	 * @returns The updated session, or undefined if not found.
	 */
	markAttached(sessionId: PersistentSessionId): PersistentSession | undefined {
		const session = this.sessions.get(sessionId as string)
		if (!session) return undefined

		const now = new Date().toISOString()
		const updated: PersistentSession = {
			...session,
			state: "attached",
			updatedAt: now,
			lastConnectedAt: now,
			isDetached: false,
			recoveryToken: undefined,
		}

		this.sessions.set(sessionId as string, updated)
		return updated
	}

	/**
	 * Detach a session — marks it as disconnected but retains it for reconnection.
	 *
	 * A recovery token is generated so the client can reconnect to the same session.
	 *
	 * @param sessionId - The session to detach.
	 *
	 * @returns The updated session, or undefined if not found.
	 */
	detachSession(sessionId: PersistentSessionId): PersistentSession | undefined {
		const session = this.sessions.get(sessionId as string)
		if (!session) return undefined

		const now = new Date().toISOString()
		const recoveryToken = generateRecoveryToken()
		const updated: PersistentSession = {
			...session,
			state: "detached",
			updatedAt: now,
			isDetached: true,
			recoveryToken,
		}

		this.sessions.set(sessionId as string, updated)
		return updated
	}

	/**
	 * Resume a detached session.
	 *
	 * Reconnects a previously detached session using its recovery token.
	 *
	 * @param sessionId - The session to resume.
	 * @param clientId - The new client ID for the reconnection.
	 *
	 * @returns The reconnect result, or undefined if the session was not found.
	 */
	resumeSession(
		sessionId: PersistentSessionId,
		clientId: string,
	): SessionReconnectResult | undefined {
		const session = this.sessions.get(sessionId as string)
		if (!session) return undefined

		const now = new Date().toISOString()
		const updated: PersistentSession = {
			...session,
			clientId,
			state: "attached",
			updatedAt: now,
			lastConnectedAt: now,
			isDetached: false,
			recoveryToken: undefined,
		}

		this.sessions.set(sessionId as string, updated)

		return {
			session: updated,
			resumed: true,
			missedEvents: 0, // TODO: compute from event store once integrated
		}
	}

	/**
	 * Resume a session by recovery token.
	 *
	 * @param recoveryToken - The recovery token from a previous detachment.
	 * @param clientId - The new client ID.
	 *
	 * @returns The reconnect result, or undefined if no matching session found.
	 */
	resumeByToken(
		recoveryToken: string,
		clientId: string,
	): SessionReconnectResult | undefined {
		for (const [, session] of this.sessions) {
			if (session.recoveryToken === recoveryToken) {
				return this.resumeSession(session.id, clientId)
			}
		}
		return undefined
	}

	/**
	 * Permanently destroy a session.
	 *
	 * @param sessionId - The session to destroy.
	 *
	 * @returns true if the session was found and removed.
	 */
	destroySession(sessionId: PersistentSessionId): boolean {
		return this.sessions.delete(sessionId as string)
	}

	// ── Query ─────────────────────────────────────────────────────────────

	/**
	 * Get a session by its ID.
	 */
	getSession(sessionId: PersistentSessionId): PersistentSession | undefined {
		return this.sessions.get(sessionId as string)
	}

	/**
	 * Get a session by client ID.
	 */
	getByClientId(clientId: string): PersistentSession | undefined {
		for (const session of this.sessions.values()) {
			if (session.clientId === clientId) return session
		}
		return undefined
	}

	/**
	 * Get a session by recovery token.
	 */
	getByRecoveryToken(recoveryToken: string): PersistentSession | undefined {
		for (const session of this.sessions.values()) {
			if (session.recoveryToken === recoveryToken) return session
		}
		return undefined
	}

	/**
	 * List sessions, optionally filtered.
	 */
	listSessions(filter: SessionFilter = {}): PersistentSession[] {
		const all = [...this.sessions.values()]

		return all.filter((session) => {
			if (filter.state !== undefined && session.state !== filter.state) {
				return false
			}
			if (filter.clientId !== undefined && session.clientId !== filter.clientId) {
				return false
			}
			if (filter.active !== undefined) {
				if (filter.active && session.isDetached) return false
				if (!filter.active && !session.isDetached) return false
			}
			return true
		})
	}

	/**
	 * Get only connected (attached) sessions.
	 */
	getActiveSessions(): PersistentSession[] {
		return this.listSessions({ active: true })
	}

	/**
	 * Get only detached sessions.
	 */
	getDetachedSessions(): PersistentSession[] {
		return this.listSessions({ active: false })
	}

	/**
	 * Get the total number of sessions.
	 */
	get count(): number {
		return this.sessions.size
	}

	// ── Cleanup ──────────────────────────────────────────────────────────

	/**
	 * Remove detached sessions that have been detached for longer than maxAgeMs.
	 *
	 * @param maxAgeMs - Maximum age of a detached session in milliseconds.
	 *
	 * @returns The number of sessions removed.
	 */
	cleanupExpiredDetached(maxAgeMs: number): number {
		const now = Date.now()
		let removed = 0

		for (const [id, session] of this.sessions) {
			if (!session.isDetached) continue

			const updatedAt = new Date(session.updatedAt).getTime()
			if (now - updatedAt >= maxAgeMs) {
				this.sessions.delete(id)
				removed++
			}
		}

		return removed
	}

	// ── Persistence helpers ───────────────────────────────────────────────

	/**
	 * Load sessions from a snapshot.
	 *
	 * Used during recovery to restore session state.
	 */
	loadFromSnapshot(sessions: PersistentSession[]): void {
		this.sessions.clear()
		for (const session of sessions) {
			this.sessions.set(session.id as string, session)
		}
	}

	/**
	 * Export sessions for snapshotting.
	 */
	exportForSnapshot(): PersistentSession[] {
		return [...this.sessions.values()]
	}
}
