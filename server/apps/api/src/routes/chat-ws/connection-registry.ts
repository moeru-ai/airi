import type { ChatBroadcastPayload } from '../../utils/chat-broadcast'

/**
 * In-process websocket connection registry keyed by authenticated user id.
 */
export interface ChatConnectionRegistry {
  /** Adds one version-specific websocket emitter for the user. */
  add: (userId: string, connectionId: string, emit: (payload: ChatBroadcastPayload) => void) => void
  /** Removes one websocket emitter and deletes the user bucket when empty. */
  remove: (userId: string, connectionId: string) => void
  /** Returns whether this process still has local connections for the user. */
  hasUser: (userId: string) => boolean
  /** Counts all local websocket connections across users for metrics export. */
  activeCount: () => number
  /** Emits `chat:new-messages` to all local user devices except an optional sender context. */
  emitNewMessages: (userId: string, excludeConnectionId: string | null, payload: ChatBroadcastPayload) => void
}

/**
 * Creates a local connection registry for chat websocket peers.
 *
 * Use when:
 * - A chat websocket runtime needs local device fanout.
 * - Engagement metrics need an active connection count.
 *
 * Expects:
 * - Contexts belong to the same process and are removed on disconnect.
 *
 * Returns:
 * - A mutable registry scoped to one chat websocket runtime.
 */
export function createChatConnectionRegistry(): ChatConnectionRegistry {
  const userConnections = new Map<string, Map<string, (payload: ChatBroadcastPayload) => void>>()

  return {
    add(userId, connectionId, emit) {
      let conns = userConnections.get(userId)
      if (!conns) {
        conns = new Map()
        userConnections.set(userId, conns)
      }
      conns.set(connectionId, emit)
    },

    remove(userId, connectionId) {
      const conns = userConnections.get(userId)
      if (!conns)
        return
      conns.delete(connectionId)
      if (conns.size === 0)
        userConnections.delete(userId)
    },

    hasUser(userId) {
      return userConnections.has(userId)
    },

    activeCount() {
      let total = 0
      for (const conns of userConnections.values())
        total += conns.size
      return total
    },

    emitNewMessages(userId, excludeConnectionId, payload) {
      const conns = userConnections.get(userId)
      if (!conns)
        return
      for (const [connectionId, emit] of conns) {
        if (connectionId !== excludeConnectionId)
          emit(payload)
      }
    },
  }
}
