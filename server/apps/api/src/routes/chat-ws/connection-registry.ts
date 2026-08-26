import type { ChatBroadcastPayload } from '../../utils/chat-broadcast'

/**
 * In-process websocket connection registry keyed by authenticated user id.
 */
export interface ChatConnectionRegistry {
  /** Counts all local websocket connections across users for metrics export. */
  activeCount: () => number
  /** Adds one version-specific websocket emitter for the user. */
  add: (userId: string, connectionId: string, emit: (payload: ChatBroadcastPayload) => void) => void
  /** Emits `chat:new-messages` to all local user devices except an optional sender context. */
  emitNewMessages: (userId: string, excludeConnectionId: null | string, payload: ChatBroadcastPayload) => void
  /** Returns whether this process still has local connections for the user. */
  hasUser: (userId: string) => boolean
  /** Removes one websocket emitter and deletes the user bucket when empty. */
  remove: (userId: string, connectionId: string) => void
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
    activeCount() {
      let total = 0
      for (const conns of userConnections.values())
        total += conns.size
      return total
    },

    add(userId, connectionId, emit) {
      let conns = userConnections.get(userId)
      if (!conns) {
        conns = new Map()
        userConnections.set(userId, conns)
      }
      conns.set(connectionId, emit)
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

    hasUser(userId) {
      return userConnections.has(userId)
    },

    remove(userId, connectionId) {
      const conns = userConnections.get(userId)
      if (!conns)
        return
      conns.delete(connectionId)
      if (conns.size === 0)
        userConnections.delete(userId)
    },
  }
}
