import type { MetadataEventSource, WebSocketEvent } from '@proj-airi/server-shared/types'

import type {
  RouteContext,
  RouteDecision,
  RouteMiddleware,
  RoutingPolicy,
} from './middlewares'
import type { AuthenticatedPeer, Peer } from './types'

import { availableLogLevelStrings, Format, LogLevelString, logLevelStringToLogLevelMap, useLogg } from '@guiiai/logg'
import { MessageHeartbeat, MessageHeartbeatKind, WebSocketEventSource } from '@proj-airi/server-shared/types'
import { defineWebSocketHandler, H3 } from 'h3'
import { nanoid } from 'nanoid'

import packageJSON from '../package.json'

import { optionOrEnv } from './config'
import {
  collectDestinations,
  createPolicyMiddleware,
  isDevtoolsPeer,
  matchesDestinations,
} from './middlewares'

function createServerEventMetadata(serverInstanceId: string, parentId?: string) {
  return {
    event: {
      id: nanoid(),
      parentId,
    },
    source: {
      plugin: WebSocketEventSource.Server,
      instanceId: serverInstanceId,
      version: packageJSON.version,
    },
  }
}

// pre-stringified responses
const RESPONSES = {
  authenticated: (serverInstanceId: string, parentId?: string) => JSON.stringify({
    type: 'module:authenticated',
    data: { authenticated: true },
    metadata: createServerEventMetadata(serverInstanceId, parentId),
  } satisfies WebSocketEvent),
  notAuthenticated: (serverInstanceId: string, parentId?: string) => JSON.stringify({
    type: 'error',
    data: { message: 'not authenticated' },
    metadata: createServerEventMetadata(serverInstanceId, parentId),
  } satisfies WebSocketEvent),
  error: (message: string, serverInstanceId: string, parentId?: string) => JSON.stringify({
    type: 'error',
    data: { message },
    metadata: createServerEventMetadata(serverInstanceId, parentId),
  }),
  heartbeat: (kind: MessageHeartbeatKind, message: MessageHeartbeat | string, serverInstanceId: string, parentId?: string) => JSON.stringify({
    type: 'transport:connection:heartbeat',
    data: { kind, message, at: Date.now() },
    metadata: createServerEventMetadata(serverInstanceId, parentId),
  } satisfies WebSocketEvent),
}

const DEFAULT_HEARTBEAT_TTL_MS = 60_000

// helper send function
function send(peer: Peer, event: WebSocketEvent<Record<string, unknown>> | string) {
  peer.send(typeof event === 'string' ? event : JSON.stringify(event))
}

export function setupApp(options?: {
  instanceId?: string
  auth?: {
    token: string
  }
  logger?: {
    app?: { level?: LogLevelString, format?: Format }
    websocket?: { level?: LogLevelString, format?: Format }
  }
  routing?: {
    middleware?: RouteMiddleware[]
    allowBypass?: boolean
    policy?: RoutingPolicy
  }
  heartbeat?: {
    readTimeout?: number
    message?: MessageHeartbeat | string
  }
}): H3 {
  const instanceId = options?.instanceId || optionOrEnv(undefined, 'SERVER_INSTANCE_ID', nanoid())
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
  const heartbeatTtlMs = options?.heartbeat?.readTimeout ?? DEFAULT_HEARTBEAT_TTL_MS
  const heartbeatMessage = options?.heartbeat?.message ?? MessageHeartbeat.Pong
  const routingMiddleware = [
    ...(options?.routing?.policy ? [createPolicyMiddleware(options.routing.policy)] : []),
    ...(options?.routing?.middleware ?? []),
  ]

  setInterval(() => {
    const now = Date.now()
    for (const [id, peerInfo] of peers.entries()) {
      if (!peerInfo.lastHeartbeatAt) {
        continue
      }

      if (now - peerInfo.lastHeartbeatAt > heartbeatTtlMs) {
        logger.withFields({ peer: id, peerName: peerInfo.name }).debug('heartbeat expired, dropping peer')
        try {
          (peerInfo.peer as Peer & { close?: () => void }).close?.()
        }
        catch (error) {
          logger.withFields({ peer: id, peerName: peerInfo.name }).withError(error as Error).debug('failed to close expired peer')
        }
        peers.delete(id)
        unregisterModulePeer(peerInfo)
      }
    }
  }, Math.max(5_000, Math.floor(heartbeatTtlMs / 2)))

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

  app.get('/ws', defineWebSocketHandler({
    open: (peer) => {
      if (authToken) {
        peers.set(peer.id, { peer, authenticated: false, name: '', lastHeartbeatAt: Date.now() })
      }
      else {
        peer.send(RESPONSES.authenticated)
        peers.set(peer.id, { peer, authenticated: true, name: '', lastHeartbeatAt: Date.now() })
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
        send(peer, RESPONSES.error(`invalid JSON, error: ${errorMessage}`, instanceId))

        return
      }

      logger.withFields({
        peer: peer.id,
        peerAuthenticated: authenticatedPeer?.authenticated,
        peerModule: authenticatedPeer?.name,
        peerModuleIndex: authenticatedPeer?.index,
      }).debug('received event')

      if (authenticatedPeer) {
        authenticatedPeer.lastHeartbeatAt = Date.now()
        if (event.metadata?.source) {
          authenticatedPeer.identity = event.metadata.source
        }
      }

      switch (event.type) {
        case 'transport:connection:heartbeat': {
          const p = peers.get(peer.id)
          if (p) {
            p.lastHeartbeatAt = Date.now()
          }

          if (event.data.kind === MessageHeartbeatKind.Ping) {
            send(peer, RESPONSES.heartbeat(MessageHeartbeatKind.Pong, heartbeatMessage, instanceId, event.metadata?.event.id))
          }

          return
        }

        case 'module:authenticate': {
          if (authToken && event.data.token !== authToken) {
            logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, peerRequest: peer.request.url }).log('authentication failed')
            send(peer, RESPONSES.error('invalid token', instanceId, event.metadata?.event.id))

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
          const { name, index, identity } = event.data as { name: string, index?: number, identity?: MetadataEventSource }
          if (!name || typeof name !== 'string') {
            send(peer, RESPONSES.error('the field \'name\' must be a non-empty string for event \'module:announce\'', instanceId))

            return
          }
          if (typeof index !== 'undefined') {
            if (!Number.isInteger(index) || index < 0) {
              send(peer, RESPONSES.error('the field \'index\' must be a non-negative integer for event \'module:announce\'', instanceId))

              return
            }
          }
          if (authToken && !p.authenticated) {
            send(peer, RESPONSES.error('must authenticate before announcing', instanceId))

            return
          }

          p.name = name
          p.index = index
          if (identity) {
            p.identity = identity
          }

          registerModulePeer(p, name, index)

          return
        }

        case 'ui:configure': {
          const { moduleName, moduleIndex, config } = event.data

          if (moduleName === '') {
            send(peer, RESPONSES.error('the field \'moduleName\' can\'t be empty for event \'ui:configure\'', instanceId))

            return
          }
          if (typeof moduleIndex !== 'undefined') {
            if (!Number.isInteger(moduleIndex) || moduleIndex < 0) {
              send(peer, RESPONSES.error('the field \'moduleIndex\' must be a non-negative integer for event \'ui:configure\'', instanceId))

              return
            }
          }

          const target = peersByModule.get(moduleName)?.get(moduleIndex)
          if (target) {
            send(target.peer, {
              type: 'module:configure',
              data: { config },
              // NOTICE: this will forward the original event metadata as-is
              metadata: event.metadata,
            })
          }
          else {
            send(peer, RESPONSES.error('module not found, it hasn\'t announced itself or the name is incorrect', instanceId))
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
      const allowBypass = options?.routing?.allowBypass !== false
      const shouldBypass = Boolean(event.route?.bypass && allowBypass && isDevtoolsPeer(p))
      const destinations = shouldBypass ? undefined : collectDestinations(event)
      const routingContext: RouteContext = {
        event,
        fromPeer: p,
        peers,
        destinations,
      }

      let decision: RouteDecision | undefined
      for (const middleware of routingMiddleware) {
        const result = middleware(routingContext)
        if (result) {
          decision = result
          break
        }
      }

      if (decision?.type === 'drop') {
        logger.withFields({ peer: peer.id, peerName: p.name, event }).debug('routing dropped event')
        return
      }

      const targetIds = decision?.type === 'targets' ? decision.targetIds : undefined
      const shouldBroadcast = decision?.type === 'broadcast' || !targetIds

      logger.withFields({ peer: peer.id, peerName: p.name, event }).debug('broadcasting event to peers')

      for (const [id, other] of peers.entries()) {
        if (id === peer.id) {
          logger.withFields({ peer: peer.id, peerName: p.name, event }).debug('not sending event to self')
          continue
        }

        if (!shouldBroadcast && targetIds && !targetIds.has(id)) {
          continue
        }

        if (shouldBroadcast && destinations && destinations.length > 0 && !matchesDestinations(destinations, other)) {
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
