import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer, Peer } from './types'

import { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createApp, createRouter, defineWebSocketHandler } from 'h3'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

// cache token once
const AUTH_TOKEN = env.AUTHENTICATION_TOKEN || ''

// pre-stringified responses
const RESPONSES = {
  authenticated: JSON.stringify({ type: 'module:authenticated', data: { authenticated: true } }),
  notAuthenticated: JSON.stringify({ type: 'error', data: { message: 'not authenticated' } }),
}

// helper send function
function send(peer: Peer, event: WebSocketEvent<Record<string, unknown>> | string) {
  peer.send(typeof event === 'string' ? event : JSON.stringify(event))
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
  const peersByModule = new Map<string, Map<number | undefined, AuthenticatedPeer>>()

  function registerModulePeer(p: AuthenticatedPeer, name: string, index?: number) {
    if (!peersByModule.has(name)) {
      peersByModule.set(name, new Map())
    }
    peersByModule.get(name)!.set(index, p)
  }

  function unregisterModulePeer(p: AuthenticatedPeer) {
    if (!p.name)
      return
    const group = peersByModule.get(p.name)
    if (group) {
      group.delete(p.index)
      if (group.size === 0) {
        peersByModule.delete(p.name)
      }
    }
  }

  router.get('/ws', defineWebSocketHandler({
    open: (peer) => {
      if (AUTH_TOKEN) {
        peers.set(peer.id, { peer, authenticated: false, name: '' })
      }
      else {
        peer.send(RESPONSES.authenticated)
        peers.set(peer.id, { peer, authenticated: true, name: '' })
      }

      websocketLogger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
    },
    message: (peer, message) => {
      let event: WebSocketEvent
      try {
        event = message.json() as WebSocketEvent
      }
      catch (err) {
        send(peer, { type: 'error', data: { message: `invalid JSON, error: ${err.message}` } })
        return
      }

      switch (event.type) {
        case 'module:authenticate': {
          if (AUTH_TOKEN && event.data.token !== AUTH_TOKEN) {
            websocketLogger.withFields({ peer: peer.id }).debug('authentication failed')
            send(peer, { type: 'error', data: { message: 'invalid token' } })
            return
          }

          peer.send(RESPONSES.authenticated)
          const p = peers.get(peer.id)
          if (p) {
            Object.assign(p, { authenticated: true })
          }
          return
        }
        case 'module:announce': {
          const p = peers.get(peer.id)
          if (p) {
            unregisterModulePeer(p)
            const { name, index } = event.data as { name: string, index?: number }
            if (!name || typeof name !== 'string') {
              send(peer, { type: 'error', data: { message: 'the field \'name\' must be a non-empty string for event \'module:announce\'' } })
              return
            }
            if (typeof index !== 'undefined') {
              if (typeof index !== 'number' || index < 0) {
                send(peer, { type: 'error', data: { message: 'the field \'index\' must be a non-negative number for event \'module:announce\'' } })
                return
              }
            }
            Object.assign(p, { authenticated: true, name, index })
            registerModulePeer(p, p.name, p.index)
          }
          return
        }

        case 'ui:configure': {
          const { moduleName, moduleIndex, config } = event.data

          if (moduleName === '') {
            send(peer, { type: 'error', data: { message: 'the field \'moduleName\' can\'t be empty for event \'ui:configure\'' } })
            return
          }
          if (typeof moduleIndex !== 'undefined' && typeof moduleIndex !== 'number') {
            send(peer, { type: 'error', data: { message: 'the field \'moduleIndex\' must be a number for event \'ui:configure\'' } })
            return
          }
          if (typeof moduleIndex !== 'undefined' && moduleIndex < 0) {
            send(peer, { type: 'error', data: { message: 'the field \'moduleIndex\' must be a positive number for event \'ui:configure\'' } })
            return
          }

          const target = peersByModule.get(moduleName)?.get(moduleIndex)
          if (target) {
            send(target.peer, { type: 'module:configure', data: { config } })
          }
          else {
            send(peer, { type: 'error', data: { message: 'module not found, it haven\'t announced it or the name was wrong' } })
          }
          return
        }
      }

      // default case
      const p = peers.get(peer.id)
      if (!p?.authenticated) {
        websocketLogger.withFields({ peer: peer.id }).debug('not authenticated')
        peer.send(RESPONSES.notAuthenticated)
        return
      }

      const payload = JSON.stringify(event)
      for (const [id, other] of peers.entries()) {
        if (id !== peer.id) {
          other.peer.send(payload)
        }
      }
    },
    error: (peer, error) => {
      websocketLogger.withFields({ peer: peer.id }).withError(error).error('an error occurred')
    },
    close: (peer, details) => {
      const p = peers.get(peer.id)
      if (p)
        unregisterModulePeer(p)

      websocketLogger.withFields({ peer: peer.id, details, activePeers: peers.size }).log('closed')
      peers.delete(peer.id)
    },
  }))

  return app
}

export const app = main()
