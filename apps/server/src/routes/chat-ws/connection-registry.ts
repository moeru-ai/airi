import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono'

import type { ChatBroadcastPayload } from '../../utils/chat-broadcast'

import { newMessages } from '@proj-airi/server-sdk-shared'

/**
 * In-process websocket connection registry keyed by authenticated user id.
 */
export interface ChatConnectionRegistry {
  /** Adds one websocket Eventa context for the user. */
  add: (userId: string, ctx: HonoWsInvocableEventContext) => void
  /** Removes one websocket Eventa context and deletes the user bucket when empty. */
  remove: (userId: string, ctx: HonoWsInvocableEventContext) => void
  /** Returns whether this process still has local connections for the user. */
  hasUser: (userId: string) => boolean
  /** Counts all local websocket connections across users for metrics export. */
  activeCount: () => number
  /** Emits `chat:new-messages` to all local user devices except an optional sender context. */
  emitNewMessages: (userId: string, excludeCtx: HonoWsInvocableEventContext | null, payload: ChatBroadcastPayload) => void
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
  const userConnections = new Map<string, Set<HonoWsInvocableEventContext>>()

  return {
    add(userId, ctx) {
      let conns = userConnections.get(userId)
      if (!conns) {
        conns = new Set()
        userConnections.set(userId, conns)
      }
      conns.add(ctx)
    },

    remove(userId, ctx) {
      const conns = userConnections.get(userId)
      if (!conns)
        return
      conns.delete(ctx)
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

    emitNewMessages(userId, excludeCtx, payload) {
      const conns = userConnections.get(userId)
      if (!conns)
        return
      for (const ctx of conns) {
        if (ctx !== excludeCtx)
          ctx.emit(newMessages, payload)
      }
    },
  }
}
