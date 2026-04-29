import type { ModuleIdentity } from '../../../shared/types'

import { nanoid } from 'nanoid/non-secure'

function createModuleIdentity(name: string, index: number): ModuleIdentity {
  const sanitizedName = name.trim() || 'plugin'

  return {
    id: `${sanitizedName}-${index}`,
    kind: 'plugin',
    plugin: {
      id: sanitizedName,
    },
  }
}

/**
 * Stores plugin sessions and generates deterministic session identities.
 *
 * Use when:
 * - The host needs to track loaded plugin sessions by id
 * - New plugin sessions need a generated session id and module identity
 *
 * Expects:
 * - `TSession` has a stable `id` field used as the registry key
 *
 * Returns:
 * - An in-memory session registry with identity generation helpers
 */
export class PluginSessionService<TSession extends { id: string }> {
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

  nextSessionIdentity(name: string) {
    const index = this.sessionCounter
    this.sessionCounter += 1

    return {
      index,
      sessionId: `plugin-session-${nanoid()}`,
      moduleIdentity: createModuleIdentity(name, index),
    }
  }
}
