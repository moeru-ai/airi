import type { GatewayWsClientMessage } from '@proj-airi/visual-chat-protocol'
import type { Peer } from 'crossws'

import { createGatewayLogger } from '@proj-airi/visual-chat-observability'
import { defineWebSocketHandler } from 'h3'

const log = createGatewayLogger()

interface CreateWsHandlerOptions {
  onClientMessage?: (message: GatewayWsClientMessage) => void | Promise<void>
  authorizeSessionAccess?: (sessionId: string, sessionToken: string) => boolean
}

export function createWsHandler(options: CreateWsHandlerOptions = {}) {
  const peers = new Set<Peer>()
  const subscriptions = new Map<Peer, Set<string>>()
  const authorizedSessions = new Map<Peer, Set<string>>()

  const handler = defineWebSocketHandler({
    open(peer) {
      peers.add(peer)
      subscriptions.set(peer, new Set())
      authorizedSessions.set(peer, new Set())
      log.withTag('ws').log(`Client connected: ${peer.id}`)
    },

    message(peer, message) {
      try {
        const data = JSON.parse(message.text()) as GatewayWsClientMessage
        if (data.type === 'subscribe' && data.sessionId) {
          if (!data.sessionToken || !options.authorizeSessionAccess?.(data.sessionId, data.sessionToken))
            return

          const peerSubscriptions = subscriptions.get(peer)
          const peerAuthorizations = authorizedSessions.get(peer)
          if (!peerSubscriptions || peerSubscriptions.has(data.sessionId))
            return

          peerSubscriptions.add(data.sessionId)
          peerAuthorizations?.add(data.sessionId)
          log.withTag('ws').log(`Client ${peer.id} subscribed to session ${data.sessionId}`)
        }
        else if (data.type === 'unsubscribe' && data.sessionId) {
          subscriptions.get(peer)?.delete(data.sessionId)
          authorizedSessions.get(peer)?.delete(data.sessionId)
        }
        else {
          if ('sessionId' in data && !authorizedSessions.get(peer)?.has(data.sessionId))
            return
          void options.onClientMessage?.(data)
        }
      }
      catch {
        // ignore malformed messages
      }
    },

    close(peer) {
      peers.delete(peer)
      subscriptions.delete(peer)
      authorizedSessions.delete(peer)
      log.withTag('ws').log(`Client disconnected: ${peer.id}`)
    },

    error(peer, err) {
      log.withTag('ws').error(`WS error for ${peer.id}: ${err}`)
    },
  })

  function broadcast(sessionId: string, event: string, data: unknown) {
    const msg = JSON.stringify({ event, sessionId, data, timestamp: Date.now() })
    for (const [peer, subs] of subscriptions) {
      if (subs.has(sessionId) || subs.has('*')) {
        try {
          peer.send(msg)
        }
        catch {
          // peer may have disconnected
        }
      }
    }
  }

  function broadcastAll(event: string, data: unknown) {
    const msg = JSON.stringify({ event, sessionId: '*', data, timestamp: Date.now() })
    for (const peer of peers) {
      try {
        peer.send(msg)
      }
      catch {
        // ignore
      }
    }
  }

  return { handler, broadcast, broadcastAll }
}
