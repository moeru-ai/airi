import type {
  DeliveryConfig,
  MetadataEventSource,
  WebSocketEvent,
} from '@proj-airi/server-shared/types'

import type {
  RouteContext,
  RouteDecision,
  RouteMiddleware,
  RoutingPolicy,
} from './middlewares'
import type { AuthenticatedPeer, Peer } from './types'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { availableLogLevelStrings, Format, LogLevelString, logLevelStringToLogLevelMap, useLogg } from '@guiiai/logg'
import {
  createInvalidJsonServerErrorMessage,
  ServerErrorMessages,
} from '@proj-airi/server-shared'
import {
  getProtocolEventMetadata,
  MessageHeartbeat,
  MessageHeartbeatKind,
  WebSocketEventSource,
} from '@proj-airi/server-shared/types'
import { defineWebSocketHandler, H3 } from 'h3'
import { nanoid } from 'nanoid'
import { parse, stringify } from 'superjson'

import packageJSON from '../package.json'

import { optionOrEnv } from './config'
import {
  collectDestinations,
  createPolicyMiddleware,
  isDevtoolsPeer,
  matchesDestinations,
} from './middlewares'

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

function createServerEventMetadata(serverInstanceId: string, parentId?: string): { source: MetadataEventSource, event: { id: string, parentId?: string } } {
  return {
    event: {
      id: nanoid(),
      parentId,
    },
    source: {
      kind: 'plugin',
      plugin: {
        id: WebSocketEventSource.Server,
        version: packageJSON.version,
      },
      id: serverInstanceId,
    },
  }
}

// pre-stringified responses, make sure to use the `send` helper function to send them
const RESPONSES = {
  authenticated: (serverInstanceId: string, parentId?: string) => ({
    type: 'module:authenticated',
    data: { authenticated: true },
    metadata: createServerEventMetadata(serverInstanceId, parentId),
  }),
  notAuthenticated: (serverInstanceId: string, parentId?: string) => ({
    type: 'error',
    data: { message: ServerErrorMessages.notAuthenticated },
    metadata: createServerEventMetadata(serverInstanceId, parentId),
  }),
  error: (message: string, serverInstanceId: string, parentId?: string) => ({
    type: 'error',
    data: { message },
    metadata: createServerEventMetadata(serverInstanceId, parentId),
  }),
  heartbeat: (kind: MessageHeartbeatKind, message: MessageHeartbeat | string, serverInstanceId: string, parentId?: string) => ({
    type: 'transport:connection:heartbeat',
    data: { kind, message, at: Date.now() },
    metadata: createServerEventMetadata(serverInstanceId, parentId),
  }),
} satisfies Record<string, (...args: unknown[]) => WebSocketEvent<Record<string, unknown>>>

const DEFAULT_HEARTBEAT_TTL_MS = 60_000
const DEFAULT_CONSUMER_GROUP = 'default'

interface ConsumerRegistration {
  event: string
  group: string
  peerId: string
  priority: number
  registeredAt: number
}

export interface ConsumerSelectionCandidate {
  peerId: string
  priority: number
  registeredAt: number
  authenticated: boolean
  healthy?: boolean
}

// helper send function
function send(peer: Peer, event: WebSocketEvent<Record<string, unknown>> | string) {
  peer.send(typeof event === 'string' ? event : stringify(event))
}

export function resolveDeliveryConfig(event: WebSocketEvent): DeliveryConfig | undefined {
  const eventMetadata = getProtocolEventMetadata(event.type)
  const defaultDelivery = eventMetadata?.delivery
  const routeDelivery = event.route?.delivery

  if (!defaultDelivery && !routeDelivery) {
    return undefined
  }

  return {
    ...defaultDelivery,
    ...routeDelivery,
  }
}

function getConsumerRegistryKey(event: string, group: string) {
  return `${event}::${group}`
}

function normalizeConsumerGroup(mode: DeliveryConfig['mode'], group?: string) {
  if (mode === 'consumer') {
    return DEFAULT_CONSUMER_GROUP
  }

  return group || DEFAULT_CONSUMER_GROUP
}

function sortConsumers(entries: Array<Pick<ConsumerSelectionCandidate, 'peerId' | 'priority' | 'registeredAt'>>) {
  return [...entries].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority
    }

    return left.registeredAt - right.registeredAt
  })
}

export function selectConsumerPeerId(options: {
  eventType: string
  fromPeerId: string
  delivery?: DeliveryConfig
  candidates: ConsumerSelectionCandidate[]
  roundRobinCursor?: Map<string, number>
  stickyAssignments?: Map<string, string>
}) {
  const { candidates, delivery, eventType, fromPeerId } = options
  if (!delivery || (delivery.mode !== 'consumer' && delivery.mode !== 'consumer-group')) {
    return
  }

  const normalizedGroup = normalizeConsumerGroup(delivery.mode, delivery.group)
  const registryKey = getConsumerRegistryKey(eventType, normalizedGroup)
  const availableEntries = sortConsumers(
    candidates
      .filter(entry => entry.peerId !== fromPeerId)
      .filter(entry => entry.authenticated && entry.healthy !== false),
  )

  if (availableEntries.length === 0) {
    return
  }

  const selection = delivery.selection ?? 'first'
  if (selection === 'sticky' && delivery.stickyKey) {
    const stickyRegistryKey = `${registryKey}::${delivery.stickyKey}`
    const stickyPeerId = options.stickyAssignments?.get(stickyRegistryKey)
    if (stickyPeerId && stickyPeerId !== fromPeerId) {
      const stickyCandidate = availableEntries.find(entry => entry.peerId === stickyPeerId)
      if (stickyCandidate) {
        return stickyPeerId
      }
    }

    const selected = availableEntries[0]
    options.stickyAssignments?.set(stickyRegistryKey, selected.peerId)
    return selected.peerId
  }

  if (selection === 'round-robin') {
    const cursor = options.roundRobinCursor?.get(registryKey) ?? 0
    const selected = availableEntries[cursor % availableEntries.length]
    options.roundRobinCursor?.set(registryKey, (cursor + 1) % availableEntries.length)
    return selected.peerId
  }

  return availableEntries[0].peerId
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

export function setupApp(options?: AppOptions): { app: H3, closeAllPeers: () => void } {
  const instanceId = options?.instanceId || optionOrEnv(undefined, 'SERVER_INSTANCE_ID', nanoid())
  const authToken = optionOrEnv(options?.auth?.token, 'AUTHENTICATION_TOKEN', '')

  const { appLogLevel, appLogFormat, websocketLogLevel, websocketLogFormat } = normalizeLoggerConfig(options)

  const appLogger = useLogg('@proj-airi/server-runtime').withLogLevel(logLevelStringToLogLevelMap[appLogLevel]).withFormat(appLogFormat)
  const logger = useLogg('@proj-airi/server-runtime:websocket').withLogLevel(logLevelStringToLogLevelMap[websocketLogLevel]).withFormat(websocketLogFormat)

  const app = new H3({
    onError: error => appLogger.withError(error).error('an error occurred'),
  })

  const peers = new Map<string, AuthenticatedPeer>()
  const peersByModule = new Map<string, Map<number | undefined, AuthenticatedPeer>>()
  const consumerRegistry = new Map<string, Map<string, Map<string, ConsumerRegistration>>>()
  const consumerKeysByPeer = new Map<string, Set<string>>()
  const deliveryRoundRobinCursor = new Map<string, number>()
  const stickyAssignments = new Map<string, string>()
  const heartbeatTtlMs = options?.heartbeat?.readTimeout ?? DEFAULT_HEARTBEAT_TTL_MS
  const heartbeatMessage = options?.heartbeat?.message ?? MessageHeartbeat.Pong
  const routingMiddleware = [
    ...(options?.routing?.policy ? [createPolicyMiddleware(options.routing.policy)] : []),
    ...(options?.routing?.middleware ?? []),
  ]

  const HEALTH_CHECK_MISSES_UNHEALTHY = 5
  const HEALTH_CHECK_MISSES_DEAD = HEALTH_CHECK_MISSES_UNHEALTHY * 2
  const healthCheckIntervalMs = Math.max(5_000, Math.floor(heartbeatTtlMs / HEALTH_CHECK_MISSES_UNHEALTHY))

  setInterval(() => {
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

      if (peerInfo.missedHeartbeats >= HEALTH_CHECK_MISSES_DEAD) {
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
      else if (peerInfo.missedHeartbeats >= HEALTH_CHECK_MISSES_UNHEALTHY && peerInfo.healthy !== false && peerInfo.name && peerInfo.identity) {
        // 5 consecutive misses — mark unhealthy
        peerInfo.healthy = false
        logger.withFields({ peer: id, peerName: peerInfo.name, missedHeartbeats: peerInfo.missedHeartbeats }).debug('heartbeat late, marking unhealthy')
        broadcastToAuthenticated({
          type: 'registry:modules:health:unhealthy',
          data: { name: peerInfo.name, index: peerInfo.index, identity: peerInfo.identity, reason: 'heartbeat late' },
          metadata: createServerEventMetadata(instanceId),
        })
      }
    }
  }, healthCheckIntervalMs)

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

  function registerConsumer(peerId: string, event: string, mode: DeliveryConfig['mode'], group?: string, priority?: number) {
    const normalizedGroup = normalizeConsumerGroup(mode, group)
    const registryKey = getConsumerRegistryKey(event, normalizedGroup)
    let groups = consumerRegistry.get(event)
    if (!groups) {
      groups = new Map()
      consumerRegistry.set(event, groups)
    }

    let peersForGroup = groups.get(normalizedGroup)
    if (!peersForGroup) {
      peersForGroup = new Map()
      groups.set(normalizedGroup, peersForGroup)
    }

    peersForGroup.set(peerId, {
      event,
      group: normalizedGroup,
      peerId,
      priority: priority ?? 0,
      registeredAt: Date.now(),
    })

    let registrations = consumerKeysByPeer.get(peerId)
    if (!registrations) {
      registrations = new Set()
      consumerKeysByPeer.set(peerId, registrations)
    }
    registrations.add(registryKey)
  }

  function unregisterConsumer(peerId: string, event: string, mode: DeliveryConfig['mode'], group?: string) {
    const normalizedGroup = normalizeConsumerGroup(mode, group)
    const registryKey = getConsumerRegistryKey(event, normalizedGroup)
    const groups = consumerRegistry.get(event)
    const peersForGroup = groups?.get(normalizedGroup)

    peersForGroup?.delete(peerId)
    if (peersForGroup?.size === 0) {
      groups?.delete(normalizedGroup)
      deliveryRoundRobinCursor.delete(registryKey)
    }
    if (groups?.size === 0) {
      consumerRegistry.delete(event)
    }

    const registrations = consumerKeysByPeer.get(peerId)
    registrations?.delete(registryKey)
    if (registrations?.size === 0) {
      consumerKeysByPeer.delete(peerId)
    }

    for (const [stickyKey, stickyPeerId] of stickyAssignments.entries()) {
      if (stickyPeerId === peerId && stickyKey.startsWith(`${registryKey}::`)) {
        stickyAssignments.delete(stickyKey)
      }
    }
  }

  function unregisterPeerConsumers(peerId: string) {
    const registrations = consumerKeysByPeer.get(peerId)
    if (!registrations?.size) {
      return
    }

    for (const registration of registrations) {
      const [event, group] = registration.split('::', 2)
      const groups = consumerRegistry.get(event)
      const peersForGroup = groups?.get(group)
      peersForGroup?.delete(peerId)
      if (peersForGroup?.size === 0) {
        groups?.delete(group)
        deliveryRoundRobinCursor.delete(registration)
      }
      if (groups?.size === 0) {
        consumerRegistry.delete(event)
      }
    }

    for (const [stickyKey, stickyPeerId] of stickyAssignments.entries()) {
      if (stickyPeerId === peerId) {
        stickyAssignments.delete(stickyKey)
      }
    }

    consumerKeysByPeer.delete(peerId)
  }

  function isEligibleConsumer(peerId: string) {
    const candidate = peers.get(peerId)
    return Boolean(
      candidate
      && candidate.authenticated
      && candidate.healthy !== false,
    )
  }

  function selectConsumer(event: WebSocketEvent, fromPeerId: string, delivery?: DeliveryConfig) {
    const entries = consumerRegistry
      .get(event.type)
      ?.get(normalizeConsumerGroup(delivery?.mode, delivery?.group))

    const selectedPeerId = selectConsumerPeerId({
      eventType: event.type,
      fromPeerId,
      delivery,
      candidates: Array.from(entries?.values() ?? [], entry => ({
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
        authenticated: Boolean(peers.get(entry.peerId)?.authenticated),
        healthy: peers.get(entry.peerId)?.healthy,
      })),
      roundRobinCursor: deliveryRoundRobinCursor,
      stickyAssignments,
    })

    if (!selectedPeerId || !isEligibleConsumer(selectedPeerId)) {
      return
    }

    return peers.get(selectedPeerId)
  }

  function unregisterModulePeer(p: AuthenticatedPeer, reason?: string) {
    unregisterPeerConsumers(p.peer.id)

    if (!p.name)
      return

    const group = peersByModule.get(p.name)
    if (group) {
      group.delete(p.index)

      if (group.size === 0) {
        peersByModule.delete(p.name)
      }
    }

    // broadcast module:de-announced to all authenticated peers
    if (p.identity) {
      broadcastToAuthenticated({
        type: 'module:de-announced',
        data: { name: p.name, index: p.index, identity: p.identity, reason },
        metadata: createServerEventMetadata(instanceId),
      })
    }

    broadcastRegistrySync()
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
      metadata: createServerEventMetadata(instanceId, parentId),
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

  app.get('/ws', defineWebSocketHandler({
    open: (peer) => {
      if (authToken) {
        peers.set(peer.id, { peer, authenticated: false, name: '', lastHeartbeatAt: Date.now() })
      }
      else {
        send(peer, RESPONSES.authenticated(instanceId))
        peers.set(peer.id, { peer, authenticated: true, name: '', lastHeartbeatAt: Date.now() })
        sendRegistrySync(peer)
      }

      logger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
    },
    message: (peer, message) => {
      const authenticatedPeer = peers.get(peer.id)
      let event: WebSocketEvent

      try {
        // NOTICE: SDK clients send events using superjson.stringify, so we must use
        // superjson.parse here instead of message.json() (which uses JSON.parse).
        // Using JSON.parse on a superjson-encoded string returns the wrapper object
        // { json: {...}, meta: {...} } with type=undefined, which breaks all event routing.
        //
        // However, external clients may send plain JSON (not superjson-encoded).
        // superjson.parse on plain JSON returns undefined since there is no `json` wrapper key.
        // In that case, fall back to JSON.parse so external clients can interoperate.
        const text = message.text()
        const parsed = parse<WebSocketEvent>(text)
        const potentialEvent = (parsed && typeof parsed === 'object' && 'type' in parsed)
          ? parsed
          : JSON.parse(text)

        if (!potentialEvent || typeof potentialEvent !== 'object' || !('type' in potentialEvent)) {
          send(peer, RESPONSES.error(ServerErrorMessages.invalidEventFormat, instanceId))
          return
        }

        event = potentialEvent as WebSocketEvent
      }
      catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        send(peer, RESPONSES.error(createInvalidJsonServerErrorMessage(errorMessage), instanceId))

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
            p.missedHeartbeats = 0

            // recover from unhealthy → healthy
            if (p.healthy === false && p.name && p.identity) {
              p.healthy = true
              logger.withFields({ peer: peer.id, peerName: p.name }).debug('heartbeat recovered, marking healthy')
              broadcastToAuthenticated({
                type: 'registry:modules:health:healthy',
                data: { name: p.name, index: p.index, identity: p.identity },
                metadata: createServerEventMetadata(instanceId, event.metadata?.event.id),
              })
            }
          }

          if (event.data.kind === MessageHeartbeatKind.Ping) {
            send(peer, RESPONSES.heartbeat(MessageHeartbeatKind.Pong, heartbeatMessage, instanceId, event.metadata?.event.id))
          }

          return
        }

        case 'module:authenticate': {
          const clientToken = typeof event.data.token === 'string' ? event.data.token : ''
          if (authToken && !timingSafeCompare(clientToken, authToken)) {
            logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, peerRequest: peer.request.url }).log('authentication failed')
            send(peer, RESPONSES.error(ServerErrorMessages.invalidToken, instanceId, event.metadata?.event.id))

            return
          }

          send(peer, RESPONSES.authenticated(instanceId, event.metadata?.event.id))
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

          unregisterModulePeer(p, 're-announcing')

          // verify
          const { name, index, identity } = event.data as { name: string, index?: number, identity?: MetadataEventSource }
          if (!name || typeof name !== 'string') {
            send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceNameInvalid, instanceId))

            return
          }
          if (typeof index !== 'undefined') {
            if (!Number.isInteger(index) || index < 0) {
              send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceIndexInvalid, instanceId))

              return
            }
          }
          if (!identity || identity.kind !== 'plugin' || !identity.plugin?.id) {
            send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceIdentityInvalid, instanceId))

            return
          }
          if (authToken && !p.authenticated) {
            send(peer, RESPONSES.error(ServerErrorMessages.mustAuthenticateBeforeAnnouncing, instanceId))

            return
          }

          p.name = name
          p.index = index
          if (identity) {
            p.identity = identity
          }

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
                metadata: createServerEventMetadata(instanceId, event.metadata?.event.id),
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
            send(peer, RESPONSES.error(ServerErrorMessages.uiConfigureModuleNameInvalid, instanceId))

            return
          }
          if (typeof moduleIndex !== 'undefined') {
            if (!Number.isInteger(moduleIndex) || moduleIndex < 0) {
              send(peer, RESPONSES.error(ServerErrorMessages.uiConfigureModuleIndexInvalid, instanceId))

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
            send(peer, RESPONSES.error(ServerErrorMessages.moduleNotFound, instanceId))
          }

          return
        }

        case 'module:consumer:register': {
          const p = peers.get(peer.id)
          if (!p?.authenticated) {
            send(peer, RESPONSES.notAuthenticated(instanceId, event.metadata?.event.id))
            return
          }

          const data = event.data as {
            event?: string
            mode?: 'consumer' | 'consumer-group'
            group?: string
            priority?: number
          }

          if (!data.event || typeof data.event !== 'string') {
            send(peer, RESPONSES.error(ServerErrorMessages.moduleConsumerEventInvalid, instanceId, event.metadata?.event.id))
            return
          }

          registerConsumer(peer.id, data.event, data.mode ?? (data.group ? 'consumer-group' : 'consumer'), data.group, data.priority)
          return
        }

        case 'module:consumer:unregister': {
          const p = peers.get(peer.id)
          if (!p?.authenticated) {
            send(peer, RESPONSES.notAuthenticated(instanceId, event.metadata?.event.id))
            return
          }

          const data = event.data as {
            event?: string
            mode?: 'consumer' | 'consumer-group'
            group?: string
          }

          if (!data.event || typeof data.event !== 'string') {
            send(peer, RESPONSES.error(ServerErrorMessages.moduleConsumerEventInvalid, instanceId, event.metadata?.event.id))
            return
          }

          unregisterConsumer(peer.id, data.event, data.mode ?? (data.group ? 'consumer-group' : 'consumer'), data.group)
          return
        }
      }

      // default case
      const p = peers.get(peer.id)
      if (!p?.authenticated) {
        logger.withFields({ peer: peer.id, peerName: p?.name, peerRemote: peer.remoteAddress, peerRequest: peer.request.url }).debug('not authenticated')
        send(peer, RESPONSES.notAuthenticated(instanceId, event.metadata?.event.id))

        return
      }

      const payload = stringify(event)
      const allowBypass = options?.routing?.allowBypass !== false
      const shouldBypass = Boolean(event.route?.bypass && allowBypass && isDevtoolsPeer(p))
      const destinations = shouldBypass ? undefined : collectDestinations(event)
      const delivery = shouldBypass ? undefined : resolveDeliveryConfig(event)
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

      const selectedConsumer = selectConsumer(event, peer.id, delivery)
      if (delivery && (delivery.mode === 'consumer' || delivery.mode === 'consumer-group')) {
        if (!selectedConsumer) {
          logger.withFields({ peer: peer.id, peerName: p.name, event, delivery }).warn('no consumer registered for event delivery')
          if (delivery.required) {
            send(peer, RESPONSES.error(ServerErrorMessages.noConsumerRegistered, instanceId, event.metadata?.event.id))
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
      if (p)
        unregisterModulePeer(p, 'connection closed')

      logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, details, activePeers: peers.size }).log('closed')
      peers.delete(peer.id)
    },
  }))

  function closeAllPeers() {
    logger.withFields({ totalPeers: peers.size }).log('closing all peers')
    for (const peer of peers.values()) {
      logger.withFields({ peer: peer.peer.id, peerName: peer.name }).debug('closing peer')
      peer.peer.close?.()
    }
  }

  return {
    app,
    closeAllPeers,
  }
}

export const { app, closeAllPeers: _ } = setupApp()
