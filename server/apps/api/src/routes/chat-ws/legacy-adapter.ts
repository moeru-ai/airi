import type { WSEvents } from 'hono/ws'

import { createPeerContext } from '@moeru/eventa-legacy/adapters/websocket/h3'

import { nanoid } from '../../utils/id'

export type LegacyChatWsContext = ReturnType<typeof createPeerContext>['context']

interface LegacyChatWsHooksOptions {
  onContext: (ctx: LegacyChatWsContext) => void
  onDisconnected: () => void
}

/**
 * Adapts Eventa `0.3.0`'s crossws peer adapter to Hono's WebSocket hooks.
 *
 * The old adapter has no Hono integration. Keep this bridge on `/ws/chat` so
 * deployed clients that use the old Eventa wire format remain supported.
 */
export function createLegacyChatWsHooks(options: LegacyChatWsHooksOptions): WSEvents {
  type LegacyPeer = Parameters<typeof createPeerContext>[0]
  type LegacyMessage = Parameters<NonNullable<ReturnType<typeof createPeerContext>['hooks']['message']>>[1]

  let peer: LegacyPeer | undefined
  let messageHandler: ReturnType<typeof createPeerContext>['hooks']['message'] | undefined

  return {
    onOpen(_event, ws) {
      peer = {
        id: nanoid(),
        send: data => ws.send(String(data)),
      } as LegacyPeer

      const created = createPeerContext(peer)
      messageHandler = created.hooks.message
      options.onContext(created.context)
    },
    onMessage(event) {
      if (!peer || !messageHandler)
        return

      const message = {
        text: () => String(event.data),
      } as LegacyMessage
      messageHandler(peer, message)
    },
    onClose() {
      options.onDisconnected()

      peer = undefined
      messageHandler = undefined
    },
  }
}
