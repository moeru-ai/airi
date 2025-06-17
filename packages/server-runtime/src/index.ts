import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer, Peer } from './types'

import { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createApp, createRouter, defineWebSocketHandler } from 'h3'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

function send(peer: Peer, event: WebSocketEvent<Record<string, unknown>>) {
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
        peers.set(peer.id, { peer, authenticated: false, name: '' })
      }
      else {
        send(peer, { type: 'module:authenticated', data: { authenticated: true } })
        peers.set(peer.id, { peer, authenticated: true, name: '' })
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
          peers.set(peer.id, { peer, authenticated: true, name: '' })
          return
        case 'module:announce':
          peers.set(peer.id, { peer, authenticated: true, name: event.data.name })
          return
        case 'ui:configure':
          if (event.data.moduleName === '') {
            send(peer, { type: 'error', data: { message: 'the field \'moduleName\' can\'t be empty for event \'ui:configure\'' } })
            return
          }
          if (typeof event.data.moduleIndex !== 'undefined' && typeof event.data.moduleIndex !== 'number') {
            send(peer, { type: 'error', data: { message: 'the field \'moduleIndex\' must be a number for event \'ui:configure\'' } })
            return
          }
          if (typeof event.data.moduleIndex !== 'undefined' && event.data.moduleIndex < 0) {
            send(peer, { type: 'error', data: { message: 'the field \'moduleIndex\' must be a positive number for event \'ui:configure\'' } })
            return
          }

          for (const [_id, p] of peers.entries()) {
            if (p.name === '') {
              continue
            }
            if (p.name === event.data.moduleName) {
              if ((typeof p.index !== 'undefined' && typeof event.data.moduleIndex !== 'undefined' && p.index === event.data.moduleIndex)) {
                send(p.peer, { type: 'module:configure', data: { config: event.data.config } })
                return
              }

              send(p.peer, { type: 'module:configure', data: { config: event.data.config } })
              return
            }

            continue
          }

          send(peer, { type: 'error', data: { message: 'module not found, it haven\'t announced it or the name was wrong' } })
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
