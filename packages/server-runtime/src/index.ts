import type { WebSocketEvent } from '@proj-airi/server-shared/types'
import type { Peer } from 'crossws'
import type { AuthenticatedPeer } from './types'
import { env } from 'node:process'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createApp, createRouter, defineWebSocketHandler } from 'h3'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

function send(peer: Peer, event: WebSocketEvent) {
  peer.send(JSON.stringify(event))
}

function main() {
  const appLogger = useLogg('App').useGlobalConfig()
  const websocketLogger = useLogg('WebSocket').useGlobalConfig()

  const app = createApp({
    onError: error => appLogger.withError(error).error('an error occurred'),
  })

  const router = createRouter()
  app.use(router)

  const peers = new Map<string, AuthenticatedPeer>()

  router.get('/ws', defineWebSocketHandler({
    open: (peer) => {
      const token = env.AUTHENTICATION_TOKEN || ''
      if (token) {
        peers.set(peer.id, { peer, authenticated: false })
      }
      else {
        send(peer, { type: 'module:authenticated', data: { authenticated: true } })
        peers.set(peer.id, { peer, authenticated: true })
      }

      websocketLogger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
    },
    message: (peer, message) => {
      const token = env.AUTHENTICATION_TOKEN || ''
      const event = message.json() as WebSocketEvent

      switch (event.type) {
        case 'module:authenticate':
          if (!!token && event.data.token !== token) {
            websocketLogger.withFields({ peer: peer.id }).debug('authentication failed')
            send(peer, { type: 'error', data: { message: 'invalid token' } })
            return
          }

          send(peer, { type: 'module:authenticated', data: { authenticated: true } })
          peers.set(peer.id, { peer, authenticated: true })
          return
      }
      if (!peers.get(peer.id)?.authenticated) {
        websocketLogger.withFields({ peer: peer.id }).debug('not authenticated')
        send(peer, { type: 'error', data: { message: 'not authenticated' } })
        return
      }

      for (const [id, p] of peers.entries()) {
        if (id !== peer.id) {
          p.peer.send(JSON.stringify(event))
        }
      }
    },
    error: (peer, error) => {
      websocketLogger.withFields({ peer: peer.id }).withError(error).error('an error occurred')
    },
    close: (peer, details) => {
      websocketLogger.withFields({ peer: peer.id, details, activePeers: peers.size }).log('closed')
      peers.delete(peer.id)
    },
  }))

  return app
}

export const app = main()
