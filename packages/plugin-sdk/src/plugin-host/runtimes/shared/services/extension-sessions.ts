import { nanoid } from 'nanoid/non-secure'

/**
 * Stores extension host sessions and generates deterministic session identities.
 *
 * Use when:
 * - The host needs to track loaded extension sessions by id
 * - New extension sessions need a generated session id and module identity
 *
 * Expects:
 * - `TSession` has a stable `id` field used as the registry key
 *
 * Returns:
 * - An in-memory session registry with identity generation helpers
 */
export class ExtensionSessionService<TSession extends { id: string }> {
  private readonly sessions = new Map<string, TSession>()
  private sessionCounter = 0

  list() {
    return [...this.sessions.values()]
  }

  get(sessionId: string) {
    return this.sessions.get(sessionId)
  }

  register(session: TSession) {
    this.sessions.set(session.id, session)
    return session
  }

  remove(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return undefined
    }

    this.sessions.delete(session.id)
    return session
  }

  nextSessionIdentity() {
    const index = this.sessionCounter
    this.sessionCounter += 1

    return {
      index,
      sessionId: `extension-session-${nanoid()}`,
    }
  }
}
