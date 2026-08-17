import type { WSEvents } from 'hono/ws'

import { createPeerContext } from '@moeru/eventa-legacy/adapters/websocket/h3'

import { nanoid } from '../../../utils/id'

export type ChatWsV1Context = ReturnType<typeof createPeerContext>['context']

interface ChatWsV1HooksOptions {
  onContext: (ctx: ChatWsV1Context) => void
  onDisconnected: () => void
}

/**
 * Adapts Eventa `0.3.0`'s crossws peer adapter to Hono's WebSocket hooks.
 *
 * The v1 adapter has no Hono integration. Keep this bridge on `/ws/chat` so
 * deployed clients that use the v1 Eventa wire format remain supported.
 */
export function createChatWsV1Hooks(options: ChatWsV1HooksOptions): WSEvents {
  type ChatWsV1Peer = Parameters<typeof createPeerContext>[0]
  type ChatWsV1Message = Parameters<NonNullable<ReturnType<typeof createPeerContext>['hooks']['message']>>[1]

  let peer: ChatWsV1Peer | undefined
  let messageHandler: ReturnType<typeof createPeerContext>['hooks']['message'] | undefined

  return {
    onOpen(_event, ws) {
      peer = {
        id: nanoid(),
        send: data => ws.send(String(data)),
      } as ChatWsV1Peer

      const created = createPeerContext(peer)
      messageHandler = created.hooks.message
      options.onContext(created.context)
    },
    onMessage(event) {
      if (!peer || !messageHandler)
        return

      const message = {
        text: () => String(event.data),
      } as ChatWsV1Message
      messageHandler(peer, message)
    },
    onClose() {
      options.onDisconnected()

      peer = undefined
      messageHandler = undefined
    },
  }
}
