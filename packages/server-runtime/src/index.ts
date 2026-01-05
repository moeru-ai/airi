import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer, Peer } from './types'

import { availableLogLevelStrings, Format, LogLevelString, logLevelStringToLogLevelMap, useLogg } from '@guiiai/logg'
import { WebSocketEventSource } from '@proj-airi/server-shared/types'
import { defineWebSocketHandler, H3, setResponseHeader, setResponseStatus } from 'h3'

import { optionOrEnv } from './config'

// pre-stringified responses
const RESPONSES = {
  authenticated: JSON.stringify({ type: 'module:authenticated', data: { authenticated: true }, source: WebSocketEventSource.Server } satisfies WebSocketEvent),
  notAuthenticated: JSON.stringify({ type: 'error', data: { message: 'not authenticated' }, source: WebSocketEventSource.Server } satisfies WebSocketEvent),
}

// helper send function
function send(peer: Peer, event: WebSocketEvent<Record<string, unknown>> | string) {
  peer.send(typeof event === 'string' ? event : JSON.stringify(event))
}

export function setupApp(options?: {
  auth?: {
    token: string
  }
  logger?: {
    app?: { level?: LogLevelString, format?: Format }
    websocket?: { level?: LogLevelString, format?: Format }
  }
}): H3 {
  const authToken = optionOrEnv(options?.auth?.token, 'AUTHENTICATION_TOKEN', '')

  const appLogLevel = optionOrEnv(options?.logger?.app?.level, 'LOG_LEVEL', LogLevelString.Log, { validator: (value): value is LogLevelString => availableLogLevelStrings.includes(value as LogLevelString) })
  const appLogFormat = optionOrEnv(options?.logger?.app?.format, 'LOG_FORMAT', Format.Pretty, { validator: (value): value is Format => Object.values(Format).includes(value as Format) })
  const websocketLogLevel = options?.logger?.websocket?.level || appLogLevel || LogLevelString.Log
  const websocketLogFormat = options?.logger?.websocket?.format || appLogFormat || Format.Pretty

  const appLogger = useLogg('@proj-airi/server-runtime').withLogLevel(logLevelStringToLogLevelMap[appLogLevel]).withFormat(appLogFormat)
  const logger = useLogg('@proj-airi/server-runtime:websocket').withLogLevel(logLevelStringToLogLevelMap[websocketLogLevel]).withFormat(websocketLogFormat)

  const app = new H3({
    onError: error => appLogger.withError(error).error('an error occurred'),
  })

  const peers = new Map<string, AuthenticatedPeer>()
  const peersByModule = new Map<string, Map<number | undefined, AuthenticatedPeer>>()

  function registerModulePeer(p: AuthenticatedPeer, name: string, index?: number) {
    if (!peersByModule.has(name)) {
      peersByModule.set(name, new Map())
    }

    const group = peersByModule.get(name)!
    if (group.has(index)) {
      // log instead of silent overwrite
      logger.withFields({ name, index }).debug('peer replaced for module')
    }

    group.set(index, p)
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

  // API endpoint to list connected plugins
  app.get('/api/plugins', (event) => {
    // Set CORS headers
    setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, OPTIONS')
    setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type')

    const plugins = Array.from(peersByModule.entries()).map(([name, peersMap]) => ({
      name,
      connectedCount: peersMap.size,
      peers: Array.from(peersMap.entries()).map(([index, peer]) => ({
        index,
        peerId: peer.peer.id,
      })),
    }))
    return { plugins }
  })

  // Handle CORS preflight for /api/plugins
  app.options('/api/plugins', (event) => {
    setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, OPTIONS')
    setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type')
    setResponseStatus(event, 204)
    return ''
  })

  app.get('/ws', defineWebSocketHandler({
    open: (peer) => {
      if (authToken) {
        peers.set(peer.id, { peer, authenticated: false, name: '' })
      }
      else {
        peer.send(RESPONSES.authenticated)
        peers.set(peer.id, { peer, authenticated: true, name: '' })
      }

      logger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
    },
    message: (peer, message) => {
      const authenticatedPeer = peers.get(peer.id)
      let event: WebSocketEvent

      try {
        event = message.json() as WebSocketEvent
      }
      catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        send(peer, { type: 'error', data: { message: `invalid JSON, error: ${errorMessage}` }, source: WebSocketEventSource.Server })

        return
      }

      logger.withFields({
        peer: peer.id,
        peerAuthenticated: authenticatedPeer?.authenticated,
        peerModule: authenticatedPeer?.name,
        peerModuleIndex: authenticatedPeer?.index,
      }).debug('received event')

      switch (event.type) {
        case 'module:authenticate': {
          if (authToken && event.data.token !== authToken) {
            logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, peerRequest: peer.request.url }).log('authentication failed')
            send(peer, {
              type: 'error',
              data: { message: 'invalid token' },
              source: WebSocketEventSource.Server,
            })

            return
          }

          peer.send(RESPONSES.authenticated)
          const p = peers.get(peer.id)
          if (p) {
            p.authenticated = true
          }

          return
        }

        case 'module:announce': {
          const p = peers.get(peer.id)
          if (!p) {
            return
          }

          unregisterModulePeer(p)

          // verify
          const { name, index } = event.data as { name: string, index?: number }
          if (!name || typeof name !== 'string') {
            send(peer, {
              type: 'error',
              data: { message: 'the field \'name\' must be a non-empty string for event \'module:announce\'' },
              source: WebSocketEventSource.Server,
            })

            return
          }
          if (typeof index !== 'undefined') {
            if (!Number.isInteger(index) || index < 0) {
              send(peer, {
                type: 'error',
                data: { message: 'the field \'index\' must be a non-negative integer for event \'module:announce\'' },
                source: WebSocketEventSource.Server,
              })

              return
            }
          }
          if (authToken && !p.authenticated) {
            send(peer, {
              type: 'error',
              data: { message: 'must authenticate before announcing' },
              source: WebSocketEventSource.Server,
            })

            return
          }

          p.name = name
          p.index = index

          registerModulePeer(p, name, index)

          return
        }

        case 'ui:configure': {
          const { moduleName, moduleIndex, config } = event.data

          if (moduleName === '') {
            send(peer, {
              type: 'error',
              data: { message: 'the field \'moduleName\' can\'t be empty for event \'ui:configure\'' },
              source: WebSocketEventSource.Server,
            })

            return
          }
          if (typeof moduleIndex !== 'undefined') {
            if (!Number.isInteger(moduleIndex) || moduleIndex < 0) {
              send(peer, {
                type: 'error',
                data: { message: 'the field \'moduleIndex\' must be a non-negative integer for event \'ui:configure\'' },
                source: WebSocketEventSource.Server,
              })

              return
            }
          }

          const target = peersByModule.get(moduleName)?.get(moduleIndex)
          if (target) {
            send(target.peer, {
              type: 'module:configure',
              data: { config },
              // NOTICE: here we will forward the source as-is
              source: event.source,
            })
          }
          else {
            send(peer, {
              type: 'error',
              data: { message: 'module not found, it hasn\'t announced itself or the name is incorrect' },
              source: WebSocketEventSource.Server,
            })
          }

          return
        }
      }

      // default case
      const p = peers.get(peer.id)
      if (!p?.authenticated) {
        logger.withFields({ peer: peer.id, peerName: p?.name, peerRemote: peer.remoteAddress, peerRequest: peer.request.url }).debug('not authenticated')
        peer.send(RESPONSES.notAuthenticated)

        return
      }

      const payload = JSON.stringify(event)
      logger.withFields({ peer: peer.id, peerName: p.name, event }).debug('broadcasting event to peers')

      for (const [id, other] of peers.entries()) {
        if (id === peer.id) {
          logger.withFields({ peer: peer.id, peerName: p.name, event }).debug('not sending event to self')
          continue
        }

        try {
          logger.withFields({ fromPeer: peer.id, fromPeerName: p.name, toPeer: other.peer.id, toPeerName: other.name, event }).debug('sending event to peer')
          other.peer.send(payload)
        }
        catch (err) {
          logger.withFields({ fromPeer: peer.id, fromPeerName: p.name, toPeer: other.peer.id, toPeerName: other.name, event }).withError(err as Error).error('failed to send event to peer, removing peer')
          logger.withFields({ peer: peer.id, peerName: other.name }).debug('removing closed peer')
          peers.delete(id)

          unregisterModulePeer(other)
        }
      }
    },
    error: (peer, error) => {
      logger.withFields({ peer: peer.id }).withError(error).error('an error occurred')
    },
    close: (peer, details) => {
      const p = peers.get(peer.id)
      if (p)
        unregisterModulePeer(p)

      logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, details, activePeers: peers.size }).log('closed')
      peers.delete(peer.id)
    },
  }))

  return app
}

export const app = setupApp() as H3
