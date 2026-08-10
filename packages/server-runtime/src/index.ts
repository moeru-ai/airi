import type { WsCloseDetails } from '@proj-airi/better-ws'
import type { WsPeer } from '@proj-airi/better-ws/server'
import type {
  DeliveryConfig,
  ExtensionIdentity,
  ExtensionModuleIdentity,
  MetadataEventSource,
  WebSocketBaseEvent,
  WebSocketEvent,
} from '@proj-airi/server-shared/types'
import type { Message as CrossWsMessage, Peer as CrossWsPeer } from 'crossws'

import type {
  RouteMiddleware,
  RoutingPolicy,
} from './middlewares'
import type { AuthenticatedPeer, Peer, RegisteredExtensionModule } from './types'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { availableLogLevelStrings, Format, LogLevelString, logLevelStringToLogLevelMap, useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { createServer as createWsServer } from '@proj-airi/better-ws/server'
import { toH3Handler } from '@proj-airi/better-ws/server/h3'
import {
  createInvalidJsonServerErrorMessage,
  ServerErrorMessages,
} from '@proj-airi/server-shared'
import {
  MessageHeartbeat,
  MessageHeartbeatKind,
} from '@proj-airi/server-shared/types'
import { H3 } from 'h3'
import { nanoid } from 'nanoid'

import { optionOrEnv } from './config'
import {
  collectDestinations,
  createPolicyMiddleware,
  isDevtoolsPeer,
  matchesDestinations,
} from './middlewares'
import {
  heartbeatFrameFrom,
  isInvalidEventError,
  parseEvent,
  stringifyEvent,
} from './server-ws/airi/codec'
import {
  createConsumerOrchestrator,
  isConsumerDeliveryMode,
  normalizeConsumerMode,
  normalizeConsumerPriority,
} from './server-ws/airi/consumers'
import {
  resolveHealthCheckIntervalMs,
  serverWsDefaultHeartbeatTtlMs,
} from './server-ws/airi/liveness'
import {
  createEventMetadata,
  createResponses,
} from './server-ws/airi/responses'
import {
  forEachEventMiddlewares,
  resolveEventDelivery,
} from './server-ws/airi/routing'

interface AiriWsMessage {
  text: () => string
}

interface AiriWsPeerState {
  rawPeer: CrossWsPeer
}

function airiPeerFromRaw(rawPeer: CrossWsPeer): Peer {
  // CrossWS peers expose the connection fields AIRI historically used directly
  // (`id`, `send`, `close`, `remoteAddress`, and `request`). Keep the cast in
  // this adapter boundary so protocol code below still depends on the AIRI peer
  // contract instead of the concrete transport type.
  return rawPeer as Peer
}

function rawPeerFrom(wsPeer: WsPeer<AiriWsMessage, AiriWsPeerState>): Peer | undefined {
  const rawPeer = wsPeer.state?.rawPeer
  if (!rawPeer) {
    return undefined
  }

  return airiPeerFromRaw(rawPeer)
}

/**
 * Constant-time string comparison that prevents timing attacks (CWE-208).
 *
 * Compares two strings in constant time to prevent attackers from learning
 * information about the target string through timing side-channels.
 *
 * Use when:
 * - Comparing authentication tokens or secrets
 * - Any security-sensitive string comparison
 *
 * Expects:
 * - Both strings are available (no lazy evaluation)
 *
 * Returns:
 * - `true` if the strings are equal, `false` otherwise
 */
function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)

  // Normalize attacker-controlled input to the expected length
  // so timingSafeEqual always performs a real comparison.
  const paddedA = Buffer.alloc(bufB.length)

  bufA.copy(
    paddedA,
    0,
    0,
    Math.min(bufA.length, bufB.length),
  )

  return (
    timingSafeEqual(paddedA, bufB)
    && bufA.length === bufB.length
  )
}

/**
 * Sends an event to a specific peer.
 * Converts the event to JSON format before transmission.
 * @internal
 */
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
 * Sets up a complete websocket server with:
 * - Peer authentication and lifecycle management
 * - Module registration and discovery (registry sync)
 * - Consumer-based event routing for load distribution
 * - Health checking with automatic peer removal on timeout
 * - Event routing with optional policy-based filtering
 * - Heartbeat monitoring for liveness detection
 *
 * Use when:
 * - Embedding the AIRI websocket runtime inside a server process
 * - Spinning up a testable application instance before binding a socket listener
 *
 * Expects:
 * - Caller lifecycle management to invoke `dispose` when the app is no longer needed
 * - Auth token (if provided) must be validated for all clients
 * - Routing middleware should be stateless and idempotent
 *
 * Returns:
 * - The H3 app at `/ws` endpoint plus cleanup helpers for peer shutdown and timer disposal
 *
 * Ownership:
 * - Manages peer registry and module registry as internal mutable state
 * - Owns all timers and intervals created during setup
 * - Consumer orchestrator state is isolated within this function scope
 */
export function setupApp(options?: AppOptions): { app: H3, closeAllPeers: () => void, dispose: () => void } {
  // === Configuration & State Initialization ===
  const instanceId = options?.instanceId || optionOrEnv(undefined, 'SERVER_INSTANCE_ID', nanoid())
  const authToken = optionOrEnv(options?.auth?.token, 'AUTHENTICATION_TOKEN', '')

  const { appLogLevel, appLogFormat, websocketLogLevel, websocketLogFormat } = normalizeLoggerConfig(options)

  const appLogger = useLogg('@proj-airi/server-runtime').withLogLevel(logLevelStringToLogLevelMap[appLogLevel]).withFormat(appLogFormat)
  const logger = useLogg('@proj-airi/server-runtime:websocket').withLogLevel(logLevelStringToLogLevelMap[websocketLogLevel]).withFormat(websocketLogFormat)

  const app = new H3({
    onError: error => appLogger.withError(error).error('an error occurred'),
  })

  // === Registries & Orchestrators ===
  // TODO: Move protocol-neutral peer registry, consumer selection, and heartbeat
  // primitives into `@proj-airi/better-ws/server` so server-runtime only owns
  // AIRI authentication, registry sync, route policy, and extension events.
  const peers = new Map<string, AuthenticatedPeer>()
  const peersByModule = new Map<string, Map<number | string | undefined, AuthenticatedPeer>>()
  const consumers = createConsumerOrchestrator()
  const heartbeatTtlMs = options?.heartbeat?.readTimeout ?? serverWsDefaultHeartbeatTtlMs
  const heartbeatMessage = options?.heartbeat?.message ?? MessageHeartbeat.Pong
  const RESPONSES = createResponses(instanceId)
  const routingMiddleware = [
    ...(options?.routing?.policy ? [createPolicyMiddleware(options.routing.policy)] : []),
    ...(options?.routing?.middleware ?? []),
  ]

  const healthCheckIntervalMs = resolveHealthCheckIntervalMs(heartbeatTtlMs)
  let disposed = false

  // === Health Check & Peer Liveness ===
  function broadcastPeerHealthy(peerInfo: AuthenticatedPeer, parentId?: string) {
    if (!peerInfo.authenticated || !peerInfo.name || !peerInfo.identity) {
      return
    }

    broadcastToAuthenticated({
      type: 'registry:modules:health:healthy',
      data: { name: peerInfo.name, index: peerInfo.index, identity: peerInfo.identity },
      metadata: createEventMetadata(instanceId, parentId),
    })
  }

  function broadcastPeerUnhealthy(peerInfo: AuthenticatedPeer, reason: string) {
    if (peerInfo.name && peerInfo.identity) {
      broadcastToAuthenticated({
        type: 'registry:modules:health:unhealthy',
        data: { name: peerInfo.name, index: peerInfo.index, identity: peerInfo.identity, reason },
        metadata: createEventMetadata(instanceId),
      })
    }

    for (const module of peerInfo.extensionModules?.values() ?? []) {
      broadcastToAuthenticated({
        type: 'registry:modules:health:unhealthy',
        data: { name: module.name, identity: module.identity, reason },
        metadata: createEventMetadata(instanceId),
      })
    }
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

  function resetRoutingState(force = false) {
    if (!force && peers.size > 0) {
      return
    }

    peers.clear()
    peersByModule.clear()
    consumers.clear()
  }

  // === Module Registry & Consumer Management ===
  function registerExtensionModulePeer(p: AuthenticatedPeer, module: RegisteredExtensionModule) {
    p.extensionModules ??= new Map()
    const previous = p.extensionModules.get(module.identity.id)
    if (previous && previous.name !== module.name) {
      unregisterExtensionModuleRegistration(p, previous, 'reannounced')
    }

    p.extensionModules.set(module.identity.id, module)

    if (!peersByModule.has(module.name)) {
      peersByModule.set(module.name, new Map())
    }

    peersByModule.get(module.name)!.set(module.identity.id, p)
    p.healthy = true
    broadcastRegistrySync()
  }

  function findModulePeer(moduleName: string, moduleIndex: number | undefined, identity?: MetadataEventSource) {
    if (isExtensionModuleIdentity(identity)) {
      return peersByModule.get(moduleName)?.get(identity.id)
    }

    // REVIEW: This keeps legacy indexed websocket module routing while extension modules move to identity keys.
    if (typeof moduleIndex !== 'undefined') {
      return peersByModule.get(moduleName)?.get(moduleIndex)
    }

    const group = peersByModule.get(moduleName)
    if (!group) {
      return undefined
    }

    // REVIEW: This preserves the old unindexed module bucket until server module routing is fully identity-based.
    const legacyPeer = group.get(undefined)
    if (legacyPeer) {
      return legacyPeer
    }

    const peers = [...group.values()]
    return peers.length === 1 ? peers[0] : undefined
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

    // broadcast extension:module:de-announced to all authenticated peers
    if (peerInfo.identity) {
      broadcastToAuthenticated({
        type: 'extension:module:de-announced',
        data: { name: peerInfo.name, identity: peerInfo.identity, possibleEvents: [], reason: options?.reason },
        metadata: createEventMetadata(instanceId),
      })
    }

    peerInfo.name = ''
    peerInfo.index = undefined

    broadcastRegistrySync()
  }

  function unregisterExtensionModuleRegistration(
    peerInfo: AuthenticatedPeer,
    module: RegisteredExtensionModule,
    reason?: string,
  ) {
    const group = peersByModule.get(module.name)
    if (group?.get(module.identity.id) === peerInfo) {
      group.delete(module.identity.id)

      if (group.size === 0) {
        peersByModule.delete(module.name)
      }
    }

    peerInfo.extensionModules?.delete(module.identity.id)
    broadcastToAuthenticated({
      type: 'extension:module:de-announced',
      data: { name: module.name, identity: module.identity, possibleEvents: [], reason },
      metadata: createEventMetadata(instanceId),
    })
  }

  function unregisterExtensionModuleRegistrations(peerInfo: AuthenticatedPeer, reason?: string) {
    if (!peerInfo.extensionModules?.size) {
      return
    }

    for (const module of Array.from(peerInfo.extensionModules.values())) {
      unregisterExtensionModuleRegistration(peerInfo, module, reason)
    }

    peerInfo.extensionModules.clear()
    broadcastRegistrySync()
  }

  function unregisterModulePeer(peerInfo: AuthenticatedPeer, reason?: string) {
    unregisterModuleRegistration(peerInfo, { reason })
    unregisterExtensionModuleRegistrations(peerInfo, reason)
  }

  function listKnownModules() {
    const legacyModules = Array.from(peers.values())
      .filter(peerInfo => peerInfo.name && peerInfo.identity)
      .map(peerInfo => ({
        name: peerInfo.name,
        index: peerInfo.index,
        identity: peerInfo.identity!,
      }))

    const extensionModules = Array.from(peers.values()).flatMap(peerInfo =>
      Array.from(peerInfo.extensionModules?.values() ?? []).map(module => ({
        name: module.name,
        identity: module.identity,
      })),
    )

    return [...legacyModules, ...extensionModules]
  }

  function isExtensionIdentity(value: unknown): value is ExtensionIdentity {
    return Boolean(
      value
      && typeof value === 'object'
      && typeof (value as Partial<ExtensionIdentity>).id === 'string',
    )
  }

  function isExtensionModuleIdentity(value: unknown): value is ExtensionModuleIdentity {
    return Boolean(
      value
      && typeof value === 'object'
      && typeof (value as Partial<ExtensionModuleIdentity>).id === 'string'
      && isExtensionIdentity((value as Partial<ExtensionModuleIdentity>).extension),
    )
  }

  // === Broadcasting & Registry Synchronization ===
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

  // === WebSocket Server Handlers ===
  // Handles AIRI peer lifecycle: open, message, error, close.
  const wsServer = createWsServer<AiriWsMessage, AiriWsPeerState>({
    peers: {
      unhealthyTimeout: heartbeatTtlMs,
      closeTimeout: heartbeatTtlMs * 2,
    },
    heartbeat: {
      interval: healthCheckIntervalMs,
      timeout: heartbeatTtlMs,
    },
  })
  wsServer.onPeerOpen(({ peer: wsPeer }) => {
    const peer = rawPeerFrom(wsPeer)
    if (!peer)
      return

    if (authToken) {
      peers.set(peer.id, { peer, authenticated: false, name: '', lastHeartbeatAt: Date.now() })
    }
    else {
      send(peer, RESPONSES.authenticated())
      peers.set(peer.id, { peer, authenticated: true, name: '', lastHeartbeatAt: Date.now() })
      sendRegistrySync(peer)
    }

    logger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
  })

  wsServer.onMessage(({ peer: wsPeer, message }) => {
    const peer = rawPeerFrom(wsPeer)
    if (!peer)
      return

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
      if (isInvalidEventError(err)) {
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

      if (authenticatedPeer.authenticated && isExtensionModuleIdentity(event.metadata?.source)) {
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

      case 'peer:authenticate': {
        const clientToken = typeof event.data.token === 'string' ? event.data.token : ''
        if (authToken && !timingSafeCompare(clientToken, authToken)) {
          logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, peerRequest: peer.request?.url }).log('peer authentication failed')
          send(peer, RESPONSES.error(ServerErrorMessages.invalidToken, event.metadata?.event.id))

          return
        }

        const authenticatedPeerId = event.data.peerId ?? peer.id
        send(peer, RESPONSES.peerAuthenticated(authenticatedPeerId, event.metadata?.event.id))
        const p = peers.get(peer.id)
        if (p) {
          p.authenticated = true
          p.peerIds ??= new Set()
          p.peerIds.add(peer.id)
          p.peerIds.add(authenticatedPeerId)
        }

        sendRegistrySync(peer, event.metadata?.event.id)

        return
      }

      case 'extension:authenticate': {
        const clientToken = typeof event.data.token === 'string' ? event.data.token : ''
        if (authToken && !timingSafeCompare(clientToken, authToken)) {
          logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, peerRequest: peer.request?.url }).log('extension authentication failed')
          send(peer, RESPONSES.error(ServerErrorMessages.invalidToken, event.metadata?.event.id))

          return
        }

        const p = peers.get(peer.id)
        if (p) {
          p.authenticated = true
          p.extensionIdentity = event.data.identity
        }

        send(peer, RESPONSES.extensionAuthenticated(event.data.identity, event.metadata?.event.id))
        sendRegistrySync(peer, event.metadata?.event.id)

        return
      }

      case 'extension:announce': {
        const p = peers.get(peer.id)
        if (!p) {
          return
        }

        if (authToken && !p.authenticated) {
          send(peer, RESPONSES.error(ServerErrorMessages.mustAuthenticateBeforeAnnouncing))

          return
        }

        if (!isExtensionIdentity(event.data.identity)) {
          send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceIdentityInvalid))

          return
        }

        p.extensionIdentity = event.data.identity

        send(peer, {
          type: 'extension:announced',
          data: event.data,
          metadata: createEventMetadata(instanceId, event.metadata?.event.id),
        })

        for (const other of peers.values()) {
          if (other.authenticated && !(other.peer.id === peer.id)) {
            send(other.peer, {
              type: 'extension:announced',
              data: event.data,
              metadata: createEventMetadata(instanceId, event.metadata?.event.id),
            })
          }
        }

        return
      }

      case 'extension:module:announce': {
        const p = peers.get(peer.id)
        if (!p) {
          return
        }

        if (authToken && !p.authenticated) {
          send(peer, RESPONSES.error(ServerErrorMessages.mustAuthenticateBeforeAnnouncing))

          return
        }

        const { name, identity } = event.data
        if (!name || typeof name !== 'string') {
          send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceNameInvalid))

          return
        }

        if (!isExtensionModuleIdentity(identity)) {
          send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceIdentityInvalid))

          return
        }

        if (p.extensionIdentity && identity.extension.id !== p.extensionIdentity.id) {
          send(peer, RESPONSES.error(ServerErrorMessages.moduleAnnounceIdentityInvalid))

          return
        }

        p.extensionIdentity = identity.extension
        registerExtensionModulePeer(p, { name, identity })

        send(peer, {
          type: 'extension:module:announced',
          data: event.data,
          metadata: createEventMetadata(instanceId, event.metadata?.event.id),
        })

        for (const other of peers.values()) {
          if (other.authenticated && !(other.peer.id === peer.id)) {
            send(other.peer, {
              type: 'extension:module:announced',
              data: event.data,
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
        const moduleName = data.moduleName ?? (isExtensionModuleIdentity(data.identity) ? data.identity.id : '') ?? ''
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

        const target = findModulePeer(moduleName, moduleIndex, data.identity)
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

        removeFailedPeer(selectedConsumer, 'consumer send failed')
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
        removeFailedPeer(other, 'send failed')
      }
    }
  })

  function handlePeerError(peer: Peer, error: unknown) {
    logger.withFields({ peer: peer.id }).withError(error).error('an error occurred')
  }

  function handlePeerClose(peer: Peer, details?: WsCloseDetails) {
    const p = peers.get(peer.id)
    const now = Date.now()
    const peerName = p?.name
    const peerIndex = p?.index
    const peerHealthy = p?.healthy
    const peerSilentFor = p?.missedHeartbeats
    const safeDetails = details ?? {}
    const closeCode = typeof safeDetails.code === 'number' ? safeDetails.code : undefined
    const closeReason = typeof safeDetails.reason === 'string' ? safeDetails.reason : undefined
    const closeWasClean = typeof (safeDetails as { wasClean?: unknown }).wasClean === 'boolean'
      ? (safeDetails as { wasClean?: unknown }).wasClean
      : undefined
    const heartbeatLastSeenAt = p?.lastHeartbeatAt
    const heartbeatSilentForMs = heartbeatLastSeenAt != null ? now - heartbeatLastSeenAt : undefined
    const likelyHeartbeatExpiry = Boolean(
      p
      && typeof heartbeatSilentForMs === 'number'
      && heartbeatSilentForMs > heartbeatTtlMs,
    )
    const likelySilentNetworkClose = closeCode === 1005

    const unregisterReason = likelyHeartbeatExpiry ? 'heartbeat expired' : closeReason === 'server shutdown' ? 'server shutdown' : 'connection closed'

    if (p) {
      peers.delete(peer.id)
      unregisterModulePeer(p, unregisterReason)
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
      peerMissedHeartbeats: p?.missedHeartbeats,
      peerSilentFor,
      heartbeatLastSeenAt,
      heartbeatSilentForMs,
      heartbeatTtlMs,
      healthCheckIntervalMs,
      likelyHeartbeatExpiry,
      likelySilentNetworkClose,
    }).log('closed')
  }

  function removeFailedPeer(peerInfo: AuthenticatedPeer, reason: string) {
    const managedPeer = wsServer.peers.get(peerInfo.peer.id)
    if (managedPeer) {
      wsServer.remove(managedPeer.id, { reason })
      return
    }

    handlePeerClose(peerInfo.peer, { reason })
  }

  wsServer.onPeerClose(({ peerId, details }) => {
    const peerInfo = peers.get(peerId)
    if (!peerInfo) {
      return
    }

    handlePeerClose(peerInfo.peer, details)
  })

  wsServer.onPeerHealthChange(({ peer, healthy, silentFor }) => {
    const peerInfo = peers.get(peer.id)
    if (!peerInfo) {
      return
    }

    // REVIEW: better-ws now reports silence duration in milliseconds, while the
    // AIRI runtime peer state still exposes the legacy missedHeartbeats field.
    // Rename this business-facing field with the server-runtime state cleanup.
    peerInfo.missedHeartbeats = silentFor

    if (healthy) {
      peerInfo.healthy = true
      logger.withFields({ peer: peer.id, peerName: peerInfo.name }).debug('peer activity recovered, marking healthy')
      broadcastPeerHealthy(peerInfo)

      return
    }

    peerInfo.healthy = false
    logger.withFields({ peer: peer.id, peerName: peerInfo.name, silentFor }).debug('heartbeat late, marking unhealthy')
    broadcastPeerUnhealthy(peerInfo, 'heartbeat late')
  })

  function unregisterClosedLivenessPeers() {
    for (const [id, peerInfo] of peers.entries()) {
      if (wsServer.peers.has(id)) {
        continue
      }

      logger.withFields({ peer: id, peerName: peerInfo.name, silentFor: peerInfo.missedHeartbeats }).debug('heartbeat silent timeout expired, dropping peer')
      peers.delete(id)
      unregisterModulePeer(peerInfo, 'heartbeat expired')
    }
  }

  let healthCheckInterval: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    try {
      wsServer.checkLiveness(Date.now())
    }
    catch (error) {
      logger.withError(error as Error).debug('websocket liveness check failed while closing expired peers')
    }
    unregisterClosedLivenessPeers()
  }, healthCheckIntervalMs)
  if (typeof healthCheckInterval === 'object') {
    healthCheckInterval.unref?.()
  }

  function clearHealthCheckInterval() {
    if (!healthCheckInterval) {
      return
    }

    clearInterval(healthCheckInterval)
    healthCheckInterval = undefined
  }

  app.get('/ws', toH3Handler(wsServer, {
    readMessage(message: CrossWsMessage) {
      return { text: () => message.text() }
    },
    state(rawPeer: CrossWsPeer) {
      return { rawPeer }
    },
    error({ peer, rawPeer, error }) {
      handlePeerError(peer ? rawPeerFrom(peer) ?? airiPeerFromRaw(rawPeer) : airiPeerFromRaw(rawPeer), error)
    },
  }))

  function closeAllPeers() {
    logger.withFields({ totalPeers: peers.size }).log('closing all peers')

    for (const peerInfo of Array.from(peers.values())) {
      logger.withFields({
        peer: peerInfo.peer.id,
        peerName: peerInfo.name,
      }).debug('closing peer')

      const managedPeer = wsServer.peers.get(peerInfo.peer.id)
      if (managedPeer) {
        try {
          managedPeer.close(undefined, 'server shutdown')
        }
        catch (error) {
          logger
            .withFields({
              peer: peerInfo.peer.id,
              peerName: peerInfo.name,
            })
            .withError(error as Error)
            .debug('failed to close peer during shutdown')
        }
        continue
      }

      try {
        handlePeerClose(peerInfo.peer, { reason: 'server shutdown' })
      }
      catch (error) {
        logger
          .withFields({
            peer: peerInfo.peer.id,
            peerName: peerInfo.name,
          })
          .withError(error as Error)
          .debug('failed to unregister peer during shutdown')
      }
    }
  }

  function dispose() {
    if (disposed) {
      return
    }

    disposed = true
    clearHealthCheckInterval()
    closeAllPeers()
    wsServer.close()
    resetRoutingState(true)
  }

  return {
    app,
    closeAllPeers,
    dispose,
  }
}
