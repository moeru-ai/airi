import type {
  DeliveryConfig,
  MetadataEventSource,
  WebSocketBaseEvent,
  WebSocketEvent,
} from '@proj-airi/server-shared/types'

import type {
  RouteMiddleware,
  RoutingPolicy,
} from './middlewares'
import type { ServerWsConsumerSelectionCandidate, ServerWsStickyAssignment } from './server-ws/core'
import type { AuthenticatedPeer, Peer } from './types'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { availableLogLevelStrings, Format, LogLevelString, logLevelStringToLogLevelMap, useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import {
  createInvalidJsonServerErrorMessage,
  ServerErrorMessages,
} from '@proj-airi/server-shared'
import {
  MessageHeartbeat,
  MessageHeartbeatKind,
} from '@proj-airi/server-shared/types'
import { defineWebSocketHandler, H3 } from 'h3'
import { nanoid } from 'nanoid'

import { optionOrEnv } from './config'
import {
  collectDestinations,
  createPolicyMiddleware,
  isDevtoolsPeer,
  matchesDestinations,
} from './middlewares'
import {
  createEventMetadata,
  createGateway,
  createResponses,
  forEachEventMiddlewares,
  heartbeatFrameFrom,
  isAiriWebSocketEventFormatError,
  parseEvent,
  resolveEventDelivery,
  stringifyEvent,
} from './server-ws/airi'
import {
  createConsumerOrchestrator,
  createServerWsPeerStore,
  isConsumerDeliveryMode,
  normalizeConsumerMode,
  normalizeConsumerPriority,
  resolveServerWsHealthCheckIntervalMs,
  selectConsumerPeerId as selectServerWsConsumerPeerId,
  serverWsDefaultHeartbeatTtlMs,
  serverWsHealthCheckMissesDead,
  serverWsHealthCheckMissesUnhealthy,
} from './server-ws/core'

export {
  heartbeatFrameFrom,
  resolveEventDelivery,
}

/**
 * Candidate peer metadata used for consumer selection.
 */
export type ConsumerSelectionCandidate = ServerWsConsumerSelectionCandidate

function normalizeRootConsumerGroup(mode: DeliveryConfig['mode'], group?: string) {
  if (mode === 'consumer') {
    return 'default'
  }

  return group || 'default'
}

/**
 * Selects a concrete consumer peer for consumer-style delivery modes.
 *
 * Use when:
 * - Existing server-runtime callers need the package-root consumer selector
 * - Sticky and round-robin state should remain stored in the original root API shape
 *
 * Expects:
 * - Candidates already describe authenticated and health state
 *
 * Returns:
 * - The selected peer id, or `undefined` when no eligible consumer is available
 */
export function selectConsumerPeerId(options: {
  eventType: string
  fromPeerId: string
  delivery?: DeliveryConfig
  candidates: ConsumerSelectionCandidate[]
  roundRobinCursor?: Map<string, number>
  stickyAssignments?: Map<string, string>
}) {
  if (!options.delivery || !isConsumerDeliveryMode(options.delivery.mode)) {
    return selectServerWsConsumerPeerId({
      eventType: options.eventType,
      fromPeerId: options.fromPeerId,
      delivery: options.delivery,
      candidates: options.candidates,
      roundRobinCursor: options.roundRobinCursor,
    })
  }

  const normalizedGroup = normalizeRootConsumerGroup(options.delivery.mode, options.delivery.group)
  const legacyRegistryKey = `${options.eventType}::${normalizedGroup}`
  const coreRegistryKey = JSON.stringify([options.eventType, normalizedGroup])
  const roundRobinCursor = options.roundRobinCursor
    ? new Map([[coreRegistryKey, options.roundRobinCursor.get(legacyRegistryKey) ?? 0]])
    : undefined

  const stickyAssignments = new Map<string, ServerWsStickyAssignment>()
  if (options.delivery.selection === 'sticky' && options.delivery.stickyKey && options.stickyAssignments) {
    const legacyStickyKey = `${legacyRegistryKey}::${options.delivery.stickyKey}`
    const stickyPeerId = options.stickyAssignments.get(legacyStickyKey)
    if (stickyPeerId) {
      stickyAssignments.set(JSON.stringify([options.eventType, normalizedGroup, options.delivery.stickyKey]), {
        event: options.eventType,
        group: normalizedGroup,
        peerId: stickyPeerId,
      })
    }
  }

  const selectedPeerId = selectServerWsConsumerPeerId({
    ...options,
    roundRobinCursor,
    stickyAssignments,
  })

  const nextCursor = roundRobinCursor?.get(coreRegistryKey)
  if (typeof nextCursor === 'number') {
    options.roundRobinCursor?.set(legacyRegistryKey, nextCursor)
  }

  if (options.delivery.selection === 'sticky' && options.delivery.stickyKey && selectedPeerId) {
    options.stickyAssignments?.set(`${legacyRegistryKey}::${options.delivery.stickyKey}`, selectedPeerId)
  }

  return selectedPeerId
}

/**
 * Constant-time string comparison that prevents timing attacks (CWE-208).
 *
 * @param {string} a - the first string to compare
 * @param {string} b - the expected value (e.g., the real secret)
 * @returns {boolean} `true` if the strings are equal, `false` otherwise
 */
function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Compare against itself to keep constant time, then return false
    timingSafeEqual(bufA, bufA)
    // To prevent leaking length information, we perform a dummy comparison on the
    // expected value, making the execution time dependent on its length.
    timingSafeEqual(bufB, bufB)
    return false
  }

  return timingSafeEqual(bufA, bufB)
}

// helper send function
function send(peer: Peer, event: WebSocketBaseEvent<string, unknown> | string) {
  peer.send(stringifyEvent(event))
}

export interface AppOptions {
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
}

/**
 * Normalizes logger settings from explicit options and environment variables.
 *
 * Use when:
 * - The runtime should support config-driven and env-driven logging
 * - App and websocket logger settings need consistent defaults
 *
 * Expects:
 * - Explicit websocket settings to override app-level defaults
 *
 * Returns:
 * - The resolved app and websocket logger configuration
 */
export function normalizeLoggerConfig(options?: AppOptions) {
  const appLogLevel = optionOrEnv(options?.logger?.app?.level, 'LOG_LEVEL', LogLevelString.Log, { validator: (value): value is LogLevelString => availableLogLevelStrings.includes(value as LogLevelString) })
  const appLogFormat = optionOrEnv(options?.logger?.app?.format, 'LOG_FORMAT', Format.Pretty, { validator: (value): value is Format => Object.values(Format).includes(value as Format) })
  const websocketLogLevel = options?.logger?.websocket?.level || appLogLevel || LogLevelString.Log
  const websocketLogFormat = options?.logger?.websocket?.format || appLogFormat || Format.Pretty

  return {
    appLogLevel,
    appLogFormat,
    websocketLogLevel,
    websocketLogFormat,
  }
}

/**
 * Creates the H3 websocket application and its in-memory peer registry.
 *
 * Use when:
 * - Embedding the AIRI websocket runtime inside a server process
 * - Spinning up a testable application instance before binding a socket listener
 *
 * Expects:
 * - Caller lifecycle management to invoke `dispose` when the app is no longer needed
 *
 * Returns:
 * - The H3 app plus cleanup helpers for peer shutdown and timer disposal
 */
export function setupApp(options?: AppOptions): { app: H3, closeAllPeers: () => void, dispose: () => void } {
  const instanceId = options?.instanceId || optionOrEnv(undefined, 'SERVER_INSTANCE_ID', nanoid())
  const authToken = optionOrEnv(options?.auth?.token, 'AUTHENTICATION_TOKEN', '')

  const { appLogLevel, appLogFormat, websocketLogLevel, websocketLogFormat } = normalizeLoggerConfig(options)

  const appLogger = useLogg('@proj-airi/server-runtime').withLogLevel(logLevelStringToLogLevelMap[appLogLevel]).withFormat(appLogFormat)
  const logger = useLogg('@proj-airi/server-runtime:websocket').withLogLevel(logLevelStringToLogLevelMap[websocketLogLevel]).withFormat(websocketLogFormat)

  const app = new H3({
    onError: error => appLogger.withError(error).error('an error occurred'),
  })

  const peerStore = createServerWsPeerStore<AuthenticatedPeer>()
  const peers = peerStore.peers
  const peersByModule = new Map<string, Map<number | undefined, AuthenticatedPeer>>()
  const consumers = createConsumerOrchestrator()
  const heartbeatTtlMs = options?.heartbeat?.readTimeout ?? serverWsDefaultHeartbeatTtlMs
  const heartbeatMessage = options?.heartbeat?.message ?? MessageHeartbeat.Pong
  const RESPONSES = createResponses(instanceId)
  const routingMiddleware = [
    ...(options?.routing?.policy ? [createPolicyMiddleware(options.routing.policy)] : []),
    ...(options?.routing?.middleware ?? []),
  ]

  const healthCheckIntervalMs = resolveServerWsHealthCheckIntervalMs(heartbeatTtlMs)
  let disposed = false

  function broadcastPeerHealthy(peerInfo: AuthenticatedPeer, parentId?: string) {
    if (!peerInfo.name || !peerInfo.identity) {
      return
    }

    broadcastToAuthenticated({
      type: 'registry:modules:health:healthy',
      data: { name: peerInfo.name, index: peerInfo.index, identity: peerInfo.identity },
      metadata: createEventMetadata(instanceId, parentId),
    })
  }

  function markPeerAlive(peerInfo: AuthenticatedPeer, options?: { parentId?: string, logMessage?: string }) {
    peerInfo.lastHeartbeatAt = Date.now()
    peerInfo.missedHeartbeats = 0

    if (peerInfo.healthy === false && peerInfo.authenticated) {
      peerInfo.healthy = true
      logger.withFields({ peer: peerInfo.peer.id, peerName: peerInfo.name }).debug(options?.logMessage ?? 'peer activity recovered, marking healthy')
      broadcastPeerHealthy(peerInfo, options?.parentId)
    }
  }

  function resetRoutingState() {
    peers.clear()
    peersByModule.clear()
    consumers.clear()
  }

  const healthCheckInterval = setInterval(() => {
    const now = Date.now()
    for (const [id, peerInfo] of peers.entries()) {
      if (!peerInfo.lastHeartbeatAt) {
        continue
      }

      const elapsed = now - peerInfo.lastHeartbeatAt
      if (elapsed > healthCheckIntervalMs) {
        peerInfo.missedHeartbeats = (peerInfo.missedHeartbeats ?? 0) + 1
      }
      else {
        peerInfo.missedHeartbeats = 0
      }

      if (peerInfo.missedHeartbeats >= serverWsHealthCheckMissesDead) {
        // 10 consecutive misses — completely dead, drop the peer
        logger.withFields({ peer: id, peerName: peerInfo.name, missedHeartbeats: peerInfo.missedHeartbeats }).debug('heartbeat expired after max misses, dropping peer')
        try {
          peerInfo.peer.close?.()
        }
        catch (error) {
          logger.withFields({ peer: id, peerName: peerInfo.name }).withError(error as Error).debug('failed to close expired peer')
        }

        peers.delete(id)
        unregisterModulePeer(peerInfo, 'heartbeat expired')
      }
      else if (peerInfo.missedHeartbeats >= serverWsHealthCheckMissesUnhealthy && peerInfo.healthy !== false && peerInfo.name && peerInfo.identity) {
        // 5 consecutive misses — mark unhealthy
        peerInfo.healthy = false
        logger.withFields({ peer: id, peerName: peerInfo.name, missedHeartbeats: peerInfo.missedHeartbeats }).debug('heartbeat late, marking unhealthy')
        broadcastToAuthenticated({
          type: 'registry:modules:health:unhealthy',
          data: { name: peerInfo.name, index: peerInfo.index, identity: peerInfo.identity, reason: 'heartbeat late' },
          metadata: createEventMetadata(instanceId),
        })
      }
    }
  }, healthCheckIntervalMs)
  if (typeof healthCheckInterval === 'object') {
    healthCheckInterval.unref?.()
  }

  function registerModulePeer(p: AuthenticatedPeer, name: string, index?: number) {
    if (!peersByModule.has(name)) {
      peersByModule.set(name, new Map())
    }

    const group = peersByModule.get(name)!
    if (group.has(index)) {
      // log instead of silent overwrite
      logger.withFields({ name, index }).debug('peer replaced for module')
    }

    p.healthy = true
    group.set(index, p)
    broadcastRegistrySync()
  }

  function registerConsumer(peerId: string, event: string, mode: ReturnType<typeof normalizeConsumerMode>, group?: string, priority?: number) {
    consumers.register({ peerId, event, mode, group, priority })
  }

  function unregisterConsumer(peerId: string, event: string, mode: ReturnType<typeof normalizeConsumerMode>, group?: string) {
    consumers.unregister({ peerId, event, mode, group })
  }

  function unregisterPeerConsumers(peerId: string) {
    consumers.unregisterPeer(peerId)
  }

  function selectConsumer(event: WebSocketEvent, fromPeerId: string, delivery?: DeliveryConfig) {
    if (!isConsumerDeliveryMode(delivery?.mode)) {
      return
    }

    const selectedPeerId = consumers.select({
      eventType: event.type,
      fromPeerId,
      delivery,
      candidates: consumers.listFor({
        event: event.type,
        mode: delivery?.mode,
        group: delivery?.group,
      }).map(entry => ({
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
        authenticated: Boolean(peers.get(entry.peerId)?.authenticated),
        healthy: peers.get(entry.peerId)?.healthy,
      })),
    })

    if (!selectedPeerId) {
      return
    }

    return peers.get(selectedPeerId)
  }

  function unregisterModuleRegistration(
    peerInfo: AuthenticatedPeer,
    options?: { reason?: string, unregisterConsumers?: boolean },
  ) {
    if (options?.unregisterConsumers !== false) {
      unregisterPeerConsumers(peerInfo.peer.id)
    }

    if (!peerInfo.name)
      return

    const group = peersByModule.get(peerInfo.name)
    if (group) {
      group.delete(peerInfo.index)

      if (group.size === 0) {
        peersByModule.delete(peerInfo.name)
      }
    }

    // broadcast module:de-announced to all authenticated peers
    if (peerInfo.identity) {
      broadcastToAuthenticated({
        type: 'module:de-announced',
        data: { name: peerInfo.name, index: peerInfo.index, identity: peerInfo.identity, reason: options?.reason },
        metadata: createEventMetadata(instanceId),
      })
    }

    peerInfo.name = ''
    peerInfo.index = undefined

    broadcastRegistrySync()
  }

  function unregisterModulePeer(peerInfo: AuthenticatedPeer, reason?: string) {
    unregisterModuleRegistration(peerInfo, { reason })
  }

  function listKnownModules() {
    return Array.from(peers.values())
      .filter(peerInfo => peerInfo.name && peerInfo.identity)
      .map(peerInfo => ({
        name: peerInfo.name,
        index: peerInfo.index,
        identity: peerInfo.identity!,
      }))
  }

  function sendRegistrySync(peer: Peer, parentId?: string) {
    send(peer, {
      type: 'registry:modules:sync',
      data: { modules: listKnownModules() },
      metadata: createEventMetadata(instanceId, parentId),
    })
  }

  function broadcastRegistrySync() {
    for (const p of peers.values()) {
      if (p.authenticated) {
        sendRegistrySync(p.peer)
      }
    }
  }

  function broadcastToAuthenticated(event: WebSocketEvent<Record<string, unknown>>) {
    for (const p of peers.values()) {
      if (p.authenticated) {
        send(p.peer, event)
      }
    }
  }

  const websocketGateway = createGateway({
    handler: {
      open: (peer) => {
        if (authToken) {
          peers.set(peer.id, { peer, authenticated: false, name: '', lastHeartbeatAt: Date.now() })
        }
        else {
          send(peer, RESPONSES.authenticated())
          peers.set(peer.id, { peer, authenticated: true, name: '', lastHeartbeatAt: Date.now() })
          sendRegistrySync(peer)
        }

        logger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
      },
      message: (peer, message) => {
        const authenticatedPeer = peers.get(peer.id)
        let event: WebSocketEvent

        try {
          const text = message.text()
          const controlFrame = heartbeatFrameFrom(text)

          // Some websocket runtimes surface control frames as plain text messages instead of
          // exposing them through dedicated ping/pong hooks. Treat those payloads as transport
          // liveness only so they do not leak into the application event protocol.
          if (controlFrame) {
            if (authenticatedPeer) {
              markPeerAlive(authenticatedPeer, { logMessage: 'ping/pong recovered, marking healthy' })
            }

            return
          }

          event = parseEvent(text)
        }
        catch (err) {
          if (isAiriWebSocketEventFormatError(err)) {
            send(peer, RESPONSES.error(ServerErrorMessages.invalidEventFormat))
            return
          }

          const errorMessage = errorMessageFrom(err) ?? 'Unknown JSON parsing error'
          send(peer, RESPONSES.error(createInvalidJsonServerErrorMessage(errorMessage)))

          return
        }

        logger.withFields({
          peer: peer.id,
          peerAuthenticated: authenticatedPeer?.authenticated,
          peerModule: authenticatedPeer?.name,
          peerModuleIndex: authenticatedPeer?.index,
        }).debug('received event')

        if (authenticatedPeer) {
          markPeerAlive(authenticatedPeer, { parentId: event.metadata?.event.id })

          if (authenticatedPeer.authenticated && event.metadata?.source) {
            authenticatedPeer.identity = event.metadata.source
          }
        }

        switch (event.type) {
          case 'transport:connection:heartbeat': {
            const p = peers.get(peer.id)
            if (p) {
              markPeerAlive(p, {
                parentId: event.metadata?.event.id,
                logMessage: 'heartbeat recovered, marking healthy',
              })

            // recover from unhealthy → healthy
            }

            if (event.data.kind === MessageHeartbeatKind.Ping) {
              send(peer, RESPONSES.heartbeat(MessageHeartbeatKind.Pong, heartbeatMessage, event.metadata?.event.id))
            }

            return
          }

          case 'module:authenticate': {
            const clientToken = typeof event.data.token === 'string' ? event.data.token : ''
            if (authToken && !timingSafeCompare(clientToken, authToken)) {
              logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, peerRequest: peer.request?.url }).log('authentication failed')
              send(peer, RESPONSES.error(ServerErrorMessages.invalidToken, event.metadata?.event.id))

              return
            }

            send(peer, RESPONSES.authenticated(event.metadata?.event.id))
            const p = peers.get(peer.id)
            if (p) {
              p.authenticated = true
            }

            sendRegistrySync(peer, event.metadata?.event.id)

            return
          }

          case 'module:announce': {
            const p = peers.get(peer.id)
            if (!p) {
              return
            }

            const { name, index, identity } = event.data as { name: string, index?: number, identity?: MetadataEventSource }
            if (!name || typeof name !== 'string') {
              send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceNameInvalid))

              return
            }
            if (typeof index !== 'undefined') {
              if (!Number.isInteger(index) || index < 0) {
                send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceIndexInvalid))

                return
              }
            }
            if (!identity || identity.kind !== 'plugin' || !identity.plugin?.id) {
              send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceIdentityInvalid))

              return
            }
            if (authToken && !p.authenticated) {
              send(peer, RESPONSES.error(ServerErrorMessages.mustAuthenticateBeforeAnnouncing))

              return
            }

            unregisterModuleRegistration(p, {
              reason: 're-announcing',
              unregisterConsumers: false,
            })

            p.name = name
            p.index = index
            p.identity = identity

            registerModulePeer(p, name, index)

            // broadcast module:announced to all authenticated peers
            for (const other of peers.values()) {
            // only send to
            // 1. authenticated peers
            // 2. other peers except the announcing peer itself
              if (other.authenticated && !(other.peer.id === peer.id)) {
                send(other.peer, {
                  type: 'module:announced',
                  data: { name, index, identity },
                  metadata: createEventMetadata(instanceId, event.metadata?.event.id),
                })
              }
            }

            return
          }

          case 'ui:configure': {
            const data = event.data as {
              moduleName?: string
              moduleIndex?: number
              identity?: MetadataEventSource
              config?: Record<string, unknown>
            }
            const moduleName = data.moduleName ?? data.identity?.plugin?.id ?? ''
            const moduleIndex = data.moduleIndex
            const config = data.config

            if (moduleName === '') {
              send(peer, RESPONSES.error(ServerErrorMessages.uiConfigureModuleNameInvalid))

              return
            }
            if (typeof moduleIndex !== 'undefined') {
              if (!Number.isInteger(moduleIndex) || moduleIndex < 0) {
                send(peer, RESPONSES.error(ServerErrorMessages.uiConfigureModuleIndexInvalid))

                return
              }
            }

            const target = peersByModule.get(moduleName)?.get(moduleIndex)
            if (target) {
              send(target.peer, {
                type: 'module:configure',
                data: { config: config || {} },
                // NOTICE: this will forward the original event metadata as-is
                metadata: event.metadata,
              })
            }
            else {
              send(peer, RESPONSES.error(ServerErrorMessages.moduleNotFound))
            }

            return
          }

          case 'module:consumer:register': {
            const p = peers.get(peer.id)
            if (!p?.authenticated) {
              send(peer, RESPONSES.notAuthenticated(event.metadata?.event.id))
              return
            }

            const data = event.data as {
              event?: string
              mode?: 'consumer' | 'consumer-group'
              group?: string
              priority?: number
            }

            if (!data.event || typeof data.event !== 'string') {
              send(peer, RESPONSES.error(ServerErrorMessages.moduleConsumerEventInvalid, event.metadata?.event.id))
              return
            }

            registerConsumer(
              peer.id,
              data.event,
              normalizeConsumerMode(data.mode, data.group),
              data.group,
              normalizeConsumerPriority(data.priority),
            )
            return
          }

          case 'module:consumer:unregister': {
            const p = peers.get(peer.id)
            if (!p?.authenticated) {
              send(peer, RESPONSES.notAuthenticated(event.metadata?.event.id))
              return
            }

            const data = event.data as {
              event?: string
              mode?: 'consumer' | 'consumer-group'
              group?: string
            }

            if (!data.event || typeof data.event !== 'string') {
              send(peer, RESPONSES.error(ServerErrorMessages.moduleConsumerEventInvalid, event.metadata?.event.id))
              return
            }

            unregisterConsumer(peer.id, data.event, normalizeConsumerMode(data.mode, data.group), data.group)
            return
          }
        }

        // default case
        const p = peers.get(peer.id)
        if (!p?.authenticated) {
          logger.withFields({ peer: peer.id, peerName: p?.name, peerRemote: peer.remoteAddress, peerRequest: peer.request?.url }).debug('not authenticated')
          send(peer, RESPONSES.notAuthenticated(event.metadata?.event.id))

          return
        }

        const payload = stringifyEvent(event)
        const allowBypass = options?.routing?.allowBypass !== false
        const shouldBypass = Boolean(event.route?.bypass && allowBypass && isDevtoolsPeer(p))
        const destinations = shouldBypass ? undefined : collectDestinations(event)
        const delivery = shouldBypass ? undefined : resolveEventDelivery(event)
        const effectiveRoutingMiddleware = shouldBypass ? [] : routingMiddleware
        const decision = forEachEventMiddlewares({
          event,
          fromPeer: p,
          peers,
          destinations,
          middleware: effectiveRoutingMiddleware,
        })

        if (decision?.type === 'drop') {
          logger.withFields({ peer: peer.id, peerName: p.name, event }).debug('routing dropped event')
          return
        }

        const selectedConsumer = selectConsumer(event, peer.id, delivery)
        if (delivery && (delivery.mode === 'consumer' || delivery.mode === 'consumer-group')) {
          if (!selectedConsumer) {
            logger.withFields({ peer: peer.id, peerName: p.name, event, delivery }).warn('no consumer registered for event delivery')
            if (delivery.required) {
              send(peer, RESPONSES.error(ServerErrorMessages.noConsumerRegistered, event.metadata?.event.id))
            }
            return
          }

          try {
            logger.withFields({
              fromPeer: peer.id,
              fromPeerName: p.name,
              toPeer: selectedConsumer.peer.id,
              toPeerName: selectedConsumer.name,
              event,
              delivery,
            }).debug('sending event to selected consumer')

            selectedConsumer.peer.send(payload)
          }
          catch (err) {
            logger.withFields({
              fromPeer: peer.id,
              fromPeerName: p.name,
              toPeer: selectedConsumer.peer.id,
              toPeerName: selectedConsumer.name,
              event,
              delivery,
            }).withError(err).error('failed to send event to selected consumer, removing peer')

            peers.delete(selectedConsumer.peer.id)
            unregisterModulePeer(selectedConsumer, 'consumer send failed')
          }
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

          if (!other.authenticated) {
            logger.withFields({ fromPeer: peer.id, toPeer: other.peer.id, toPeerName: other.name, event }).debug('not sending event to unauthenticated peer')
            continue
          }

          if (!shouldBroadcast && targetIds && !targetIds.has(id)) {
            continue
          }

          if (shouldBroadcast && destinations !== undefined && !matchesDestinations(destinations, other)) {
            continue
          }

          try {
            logger.withFields({ fromPeer: peer.id, fromPeerName: p.name, toPeer: other.peer.id, toPeerName: other.name, event }).debug('sending event to peer')
            other.peer.send(payload)
          }
          catch (err) {
            logger.withFields({ fromPeer: peer.id, fromPeerName: p.name, toPeer: other.peer.id, toPeerName: other.name, event }).withError(err).error('failed to send event to peer, removing peer')
            logger.withFields({ peer: peer.id, peerName: other.name }).debug('removing closed peer')
            peers.delete(id)

            unregisterModulePeer(other, 'send failed')
          }
        }
      },
      error: (peer, error) => {
        logger.withFields({ peer: peer.id }).withError(error).error('an error occurred')
      },
      close: (peer, details) => {
        const p = peers.get(peer.id)
        const now = Date.now()
        const peerName = p?.name
        const peerIndex = p?.index
        const peerHealthy = p?.healthy
        const peerMissedHeartbeats = p?.missedHeartbeats
        const safeDetails = details ?? {}
        const closeCode = typeof safeDetails.code === 'number' ? safeDetails.code : undefined
        const closeReason = typeof safeDetails.reason === 'string' ? safeDetails.reason : undefined
        const closeWasClean = typeof (safeDetails as { wasClean?: unknown }).wasClean === 'boolean'
          ? (safeDetails as { wasClean?: unknown }).wasClean
          : undefined
        const heartbeatLastSeenAt = p?.lastHeartbeatAt
        const heartbeatSilentForMs = heartbeatLastSeenAt ? now - heartbeatLastSeenAt : undefined
        const likelyHeartbeatExpiry = Boolean(
          p
          && typeof heartbeatSilentForMs === 'number'
          && heartbeatSilentForMs > heartbeatTtlMs,
        )
        const likelySilentNetworkClose = closeCode === 1005

        if (p) {
          peers.delete(peer.id)
          unregisterModulePeer(p, 'connection closed')
        }

        logger.withFields({
          peer: peer.id,
          peerRemote: peer.remoteAddress,
          details,
          closeCode,
          closeReason,
          closeWasClean,
          activePeers: peers.size,
          peerAuthenticated: p?.authenticated,
          peerName,
          peerIndex,
          peerHealthy,
          peerMissedHeartbeats,
          heartbeatLastSeenAt,
          heartbeatSilentForMs,
          heartbeatTtlMs,
          healthCheckIntervalMs,
          likelyHeartbeatExpiry,
          likelySilentNetworkClose,
        }).log('closed')
      },
    },
    dispose: () => {
      clearInterval(healthCheckInterval)
      closeAllPeers()
      resetRoutingState()
    },
  })

  app.get('/ws', defineWebSocketHandler(websocketGateway.handler))

  function closeAllPeers() {
    logger.withFields({ totalPeers: peers.size }).log('closing all peers')
    for (const peer of Array.from(peers.values())) {
      logger.withFields({ peer: peer.peer.id, peerName: peer.name }).debug('closing peer')
      try {
        peer.peer.close?.()
      }
      catch (error) {
        logger.withFields({ peer: peer.peer.id, peerName: peer.name }).withError(error as Error).debug('failed to close peer during shutdown')
      }
    }
  }

  function dispose() {
    if (disposed) {
      return
    }

    disposed = true
    websocketGateway.dispose()
  }

  return {
    app,
    closeAllPeers,
    dispose,
  }
}
