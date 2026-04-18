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
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')

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

function createServerEventMetadata(
  serverInstanceId: string,
  parentId?: string,
): { source: MetadataEventSource, event: { id: string, parentId?: string } } {
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
} satisfies Record<string, (...args: any[]) => WebSocketEvent<Record<string, unknown>>>

const DEFAULT_HEARTBEAT_TTL_MS = 60_000
const DEFAULT_CONSUMER_GROUP = 'default'

const MAX_BUFFERED_AMOUNT_BYTES = 512 * 1024
const MAX_PENDING_SENDS_PER_PEER = 256
const MAX_PENDING_SEND_BYTES_PER_PEER = 1 * 1024 * 1024
const MAX_PENDING_SENDS_PER_FLUSH_PER_PEER = 50
const MAX_PENDING_SEND_FAILURES = 3

interface ConsumerRegistration {
  event: string
  group: string
  peerId: string
  priority: number
  registeredAt: number
}

interface PendingOutboundQueue {
  payloads: string[]
  totalBytes: number
  failedAttempts: number
}

export interface ConsumerSelectionCandidate {
  peerId: string
  priority: number
  registeredAt: number
  authenticated: boolean
  healthy?: boolean
}

type OutboundSendResult = 'sent' | 'backpressure' | 'failed' | 'closed'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPluginMetadataEventSource(value: unknown): value is MetadataEventSource {
  return isRecord(value)
    && value.kind === 'plugin'
    && isRecord(value.plugin)
    && typeof value.plugin.id === 'string'
}

function isWebSocketEventLike(value: unknown): value is WebSocketEvent {
  return isRecord(value) && 'type' in value
}

function isLikelyBackpressureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /buffer|backpressure|would block|resource temporarily unavailable|temporar/i.test(message)
}

function isPeerLikelyClosed(peer: Peer): boolean {
  const candidate = peer as Peer & {
    readyState?: number
    closed?: boolean
    socket?: { destroyed?: boolean }
    _socket?: { destroyed?: boolean }
    transport?: { destroyed?: boolean }
  }

  if (candidate.closed === true) {
    return true
  }

  if (typeof candidate.readyState === 'number' && candidate.readyState === 3) {
    return true
  }

  if (candidate.socket?.destroyed === true || candidate._socket?.destroyed === true || candidate.transport?.destroyed === true) {
    return true
  }

  return false
}

function getPeerBufferedAmount(peer: Peer): number | undefined {
  const candidate = peer as Peer & {
    bufferedAmount?: unknown
    socket?: { bufferedAmount?: unknown }
    _socket?: { bufferedAmount?: unknown }
    transport?: { bufferedAmount?: unknown }
  }

  const values = [
    candidate.bufferedAmount,
    candidate.socket?.bufferedAmount,
    candidate._socket?.bufferedAmount,
    candidate.transport?.bufferedAmount,
  ]

  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return undefined
}

// helper send function
function send(peer: Peer, event: WebSocketEvent<Record<string, unknown>> | string): boolean {
  const payload = typeof event === 'string' ? event : stringify(event)
  const result = attemptImmediateSend(peer, payload)

  if (result === 'sent') {
    return true
  }

  if (result === 'closed') {
    return false
  }

  if (result === 'backpressure') {
    return queueOutbound(peer.id, payload)
  }

  return false
}

function attemptImmediateSend(peer: Peer, payload: string): OutboundSendResult {
  if (isPeerLikelyClosed(peer)) {
    return 'closed'
  }

  try {
    peer.send(payload)
    return 'sent'
  }
  catch (error) {
    if (isPeerLikelyClosed(peer)) {
      return 'closed'
    }

    if (isLikelyBackpressureError(error)) {
      return 'backpressure'
    }

    return 'failed'
  }
}

function queueOutbound(peerId: string, payload: string): boolean {
  const queue = pendingOutboundByPeer.get(peerId) ?? { payloads: [], totalBytes: 0, failedAttempts: 0 }
  const payloadBytes = Buffer.byteLength(payload, 'utf8')

  if (queue.payloads.length >= MAX_PENDING_SENDS_PER_PEER) {
    return false
  }

  if (queue.totalBytes + payloadBytes > MAX_PENDING_SEND_BYTES_PER_PEER) {
    return false
  }

  queue.payloads.push(payload)
  queue.totalBytes += payloadBytes
  pendingOutboundByPeer.set(peerId, queue)
  schedulePendingSendFlush()
  return true
}

function schedulePendingSendFlush() {
  if (pendingFlushTimer) {
    return
  }

  pendingFlushTimer = setTimeout(() => {
    pendingFlushTimer = undefined
    flushPendingSends()
  }, 0)
}

function flushPendingSends(peerId?: string) {
  const peerIds = typeof peerId === 'string'
    ? [peerId]
    : Array.from(pendingOutboundByPeer.keys())

  for (const id of peerIds) {
    const queue = pendingOutboundByPeer.get(id)
    if (!queue || queue.payloads.length === 0) {
      pendingOutboundByPeer.delete(id)
      continue
    }

    const peer = peersRef?.get(id)
    if (!peer) {
      pendingOutboundByPeer.delete(id)
      continue
    }

    let sentCount = 0
    while (queue.payloads.length > 0 && sentCount < MAX_PENDING_SENDS_PER_FLUSH_PER_PEER) {
      if (isPeerLikelyClosed(peer.peer)) {
        pendingOutboundByPeer.delete(id)
        break
      }

      const bufferedAmount = getPeerBufferedAmount(peer.peer)
      if (typeof bufferedAmount === 'number' && bufferedAmount > MAX_BUFFERED_AMOUNT_BYTES) {
        break
      }

      const payload = queue.payloads[0]
      const result = attemptImmediateSend(peer.peer, payload)

      if (result === 'sent') {
        queue.payloads.shift()
        queue.totalBytes -= Buffer.byteLength(payload, 'utf8')
        queue.failedAttempts = 0
        sentCount += 1
        continue
      }

      if (result === 'closed') {
        pendingOutboundByPeer.delete(id)
        break
      }

      if (result === 'backpressure') {
        queue.failedAttempts = 0
        break
      }

      // Failed for a non-closure reason: do not keep retrying forever.
      queue.failedAttempts += 1
      if (queue.failedAttempts >= MAX_PENDING_SEND_FAILURES) {
        pendingOutboundByPeer.delete(id)
      }
      break
    }

    if (queue.payloads.length === 0) {
      pendingOutboundByPeer.delete(id)
    }
  }
}

function getConsumerRegistryKey(event: string, group: string) {
  return JSON.stringify([event, group] as const)
}

function parseConsumerRegistryKey(registryKey: string): { event: string, group: string } | undefined {
  try {
    const parsed = JSON.parse(registryKey) as unknown
    if (
      Array.isArray(parsed)
      && parsed.length === 2
      && typeof parsed[0] === 'string'
      && typeof parsed[1] === 'string'
    ) {
      return { event: parsed[0], group: parsed[1] }
    }
  }
  catch {
    // fall through to legacy format handling below
  }

  // Legacy fallback for older registry keys.
  const separatorIndex = registryKey.indexOf('::')
  if (separatorIndex > -1) {
    const event = registryKey.slice(0, separatorIndex)
    const group = registryKey.slice(separatorIndex + 2)
    if (event && group) {
      return { event, group }
    }
  }

  return undefined
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

/**
 * Accepts both superjson and plain JSON payloads.
 * This keeps interoperability without changing the event protocol itself.
 */
function parseIncomingEvent(text: string): { event?: WebSocketEvent, errorMessage?: string } {
  try {
    const parsed = parse<unknown>(text)
    if (isWebSocketEventLike(parsed)) {
      return { event: parsed }
    }

    const json = JSON.parse(text)
    if (isWebSocketEventLike(json)) {
      return { event: json }
    }

    return {}
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { errorMessage }
  }
}

function getEventData(event: WebSocketEvent): Record<string, unknown> | undefined {
  const data = (event as { data?: unknown }).data
  return isRecord(data) ? data : undefined
}

export function detectHeartbeatControlFrame(text: string): MessageHeartbeatKind | undefined {
  if (text === MessageHeartbeatKind.Ping || text === MessageHeartbeatKind.Pong) {
    return text
  }

  return undefined
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

export function selectConsumerPeerId(options: {
  eventType: string
  fromPeerId: string
  delivery?: DeliveryConfig
  candidates: ConsumerSelectionCandidate[]
  roundRobinCursor?: Map<string, number>
  stickyAssignments?: Map<string, string>
  stickyAssignmentTimestamps?: Map<string, number>
  stickyAssignmentTtlMs?: number
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
    const stickyAssignedAt = options.stickyAssignmentTimestamps?.get(stickyRegistryKey)
    const stickyTtlMs = options.stickyAssignmentTtlMs ?? Math.max(DEFAULT_HEARTBEAT_TTL_MS * 2, 5 * 60_000)
    const stickyExpired = typeof stickyAssignedAt === 'number' && Date.now() - stickyAssignedAt > stickyTtlMs

    if (stickyExpired) {
      options.stickyAssignments?.delete(stickyRegistryKey)
      options.stickyAssignmentTimestamps?.delete(stickyRegistryKey)
    }
    else if (stickyPeerId && stickyPeerId !== fromPeerId) {
      const stickyCandidate = availableEntries.find(entry => entry.peerId === stickyPeerId)
      if (stickyCandidate) {
        options.stickyAssignmentTimestamps?.set(stickyRegistryKey, Date.now())
        return stickyPeerId
      }

      options.stickyAssignments?.delete(stickyRegistryKey)
      options.stickyAssignmentTimestamps?.delete(stickyRegistryKey)
    }

    const selected = availableEntries[0]
    options.stickyAssignments?.set(stickyRegistryKey, selected.peerId)
    options.stickyAssignmentTimestamps?.set(stickyRegistryKey, Date.now())
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
  const appLogLevel = optionOrEnv(
    options?.logger?.app?.level,
    'LOG_LEVEL',
    LogLevelString.Log,
    {
      validator: (value): value is LogLevelString => availableLogLevelStrings.includes(value as LogLevelString),
    },
  )

  const appLogFormat = optionOrEnv(
    options?.logger?.app?.format,
    'LOG_FORMAT',
    Format.Pretty,
    {
      validator: (value): value is Format => Object.values(Format).includes(value as Format),
    },
  )

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
  const stickyAssignmentTimestamps = new Map<string, number>()
  const pendingOutboundByPeer = new Map<string, PendingOutboundQueue>()
  let pendingFlushTimer: ReturnType<typeof setTimeout> | undefined

  // `flushPendingSends` needs access to the live peer map, so we keep a local reference
  // that is assigned immediately after declaration and cleared on shutdown.
  let peersRef: Map<string, AuthenticatedPeer> | undefined = peers

  const heartbeatTtlMs = options?.heartbeat?.readTimeout ?? DEFAULT_HEARTBEAT_TTL_MS
  const heartbeatMessage = options?.heartbeat?.message ?? MessageHeartbeat.Pong
  const routingMiddleware = [
    ...(options?.routing?.policy ? [createPolicyMiddleware(options.routing.policy)] : []),
    ...(options?.routing?.middleware ?? []),
  ]

  const HEALTH_CHECK_MISSES_UNHEALTHY = 5
  const HEALTH_CHECK_MISSES_DEAD = HEALTH_CHECK_MISSES_UNHEALTHY * 2
  const healthCheckIntervalMs = Math.max(5_000, Math.floor(heartbeatTtlMs / HEALTH_CHECK_MISSES_UNHEALTHY))
  const stickyAssignmentTtlMs = Math.max(heartbeatTtlMs * 2, 5 * 60_000)

  const healthCheckTimer = setInterval(() => {
    const now = Date.now()

    for (const [id, peerInfo] of Array.from(peers.entries())) {
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

    cleanupStickyAssignments(now)
    flushPendingSends()
  }, healthCheckIntervalMs)

  function cleanupStickyAssignments(now = Date.now()) {
    for (const [stickyKey, stickyPeerId] of Array.from(stickyAssignments.entries())) {
      const stickyAssignedAt = stickyAssignmentTimestamps.get(stickyKey)
      const stickyPeer = peers.get(stickyPeerId)
      const expired = typeof stickyAssignedAt !== 'number' || now - stickyAssignedAt > stickyAssignmentTtlMs
      const invalid = !stickyPeer || !stickyPeer.authenticated || stickyPeer.healthy === false

      if (expired || invalid) {
        stickyAssignments.delete(stickyKey)
        stickyAssignmentTimestamps.delete(stickyKey)
      }
    }
  }

  function deletePendingSends(peerId: string) {
    pendingOutboundByPeer.delete(peerId)
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
    cleanupStickyAssignments()
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

    for (const [stickyKey, stickyPeerId] of Array.from(stickyAssignments.entries())) {
      if (stickyPeerId === peerId && stickyKey.startsWith(`${registryKey}::`)) {
        stickyAssignments.delete(stickyKey)
        stickyAssignmentTimestamps.delete(stickyKey)
      }
    }
  }

  function unregisterPeerConsumers(peerId: string) {
    const registrations = consumerKeysByPeer.get(peerId)
    if (!registrations?.size) {
      return
    }

    for (const registration of registrations) {
      const parsed = parseConsumerRegistryKey(registration)
      if (!parsed) {
        continue
      }

      const { event, group } = parsed
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

    for (const [stickyKey, stickyPeerId] of Array.from(stickyAssignments.entries())) {
      if (stickyPeerId === peerId) {
        stickyAssignments.delete(stickyKey)
        stickyAssignmentTimestamps.delete(stickyKey)
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
      stickyAssignmentTimestamps,
      stickyAssignmentTtlMs,
    })

    if (!selectedPeerId || !isEligibleConsumer(selectedPeerId)) {
      return
    }

    return peers.get(selectedPeerId)
  }

  function unregisterModulePeer(p: AuthenticatedPeer, reason?: string) {
    unregisterPeerConsumers(p.peer.id)
    deletePendingSends(p.peer.id)
    cleanupStickyAssignments()

    if (!p.name) {
      return
    }

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
    const authenticatedPeers = Array.from(peers.values()).filter(p => p.authenticated)
    for (const p of authenticatedPeers) {
      sendRegistrySync(p.peer)
    }
  }

  function broadcastToAuthenticated(event: WebSocketEvent<Record<string, unknown>>) {
    const authenticatedPeers = Array.from(peers.values()).filter(p => p.authenticated)
    for (const p of authenticatedPeers) {
      send(p.peer, event)
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
        const text = message.text()
        const controlFrame = detectHeartbeatControlFrame(text)

        // Some websocket runtimes surface control frames as plain text messages instead of
        // exposing them through dedicated ping/pong hooks. Treat those payloads as transport
        // liveness only so they do not leak into the application event protocol.
        if (controlFrame) {
          if (authenticatedPeer) {
            authenticatedPeer.lastHeartbeatAt = Date.now()
            authenticatedPeer.missedHeartbeats = 0

            if (authenticatedPeer.healthy === false && authenticatedPeer.name && authenticatedPeer.identity) {
              authenticatedPeer.healthy = true
              logger.withFields({ peer: peer.id, peerName: authenticatedPeer.name })
                .debug('ping/pong recovered, marking healthy')
              broadcastToAuthenticated({
                type: 'registry:modules:health:healthy',
                data: { name: authenticatedPeer.name, index: authenticatedPeer.index, identity: authenticatedPeer.identity },
                metadata: createServerEventMetadata(instanceId),
              })
            }
          }

          return
        }

        // NOTICE: SDK clients send events using superjson.stringify, so we must use
        // superjson.parse here instead of message.json() (which uses JSON.parse).
        // Using JSON.parse on a superjson-encoded string returns the wrapper object
        // { json: {...}, meta: {...} } with type=undefined, which breaks all event routing.
        //
        // However, external clients may send plain JSON (not superjson-encoded).
        // superjson.parse on plain JSON returns undefined since there is no `json` wrapper key.
        // In that case, fall back to JSON.parse so external clients can interoperate.
        const parsedResult = parseIncomingEvent(text)

        if (parsedResult.errorMessage) {
          send(peer, RESPONSES.error(createInvalidJsonServerErrorMessage(parsedResult.errorMessage), instanceId))
          return
        }

        if (!parsedResult.event) {
          send(peer, RESPONSES.error(ServerErrorMessages.invalidEventFormat, instanceId))
          return
        }

        event = parsedResult.event
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

        const source = (event as { metadata?: { source?: unknown } }).metadata?.source
        if (isPluginMetadataEventSource(source)) {
          authenticatedPeer.identity = source
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
                metadata: createServerEventMetadata(instanceId, event.metadata?.event?.id),
              })
            }
          }

          const heartbeatData = getEventData(event)
          const heartbeatKind = heartbeatData?.kind

          if (heartbeatKind === MessageHeartbeatKind.Ping) {
            send(peer, RESPONSES.heartbeat(MessageHeartbeatKind.Pong, heartbeatMessage, instanceId, event.metadata?.event?.id))
          }

          return
        }

        case 'module:authenticate': {
          const data = getEventData(event)
          const clientToken = typeof data?.token === 'string' ? data.token : ''

          if (authToken && !timingSafeCompare(clientToken, authToken)) {
            logger.withFields({ peer: peer.id, peerRemote: peer.remoteAddress, peerRequest: peer.request.url }).log('authentication failed')
            send(peer, RESPONSES.error(ServerErrorMessages.invalidToken, instanceId, event.metadata?.event?.id))

            return
          }

          send(peer, RESPONSES.authenticated(instanceId, event.metadata?.event?.id))
          const p = peers.get(peer.id)
          if (p) {
            p.authenticated = true
          }

          sendRegistrySync(peer, event.metadata?.event?.id)

          return
        }

        case 'module:announce': {
          const p = peers.get(peer.id)
          if (!p) {
            return
          }

          // verify
          const data = getEventData(event)
          const name = typeof data?.name === 'string' ? data.name : ''
          const index = typeof data?.index === 'number' ? data.index : undefined
          const identity = isPluginMetadataEventSource(data?.identity) ? data.identity : undefined

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

          unregisterModulePeer(p, 're-announcing')

          p.name = name
          p.index = index
          p.identity = identity
          registerModulePeer(p, name, index)

          // broadcast module:announced to all authenticated peers
          for (const other of Array.from(peers.values())) {
            // only send to
            // 1. authenticated peers
            // 2. other peers except the announcing peer itself
            if (other.authenticated && !(other.peer.id === peer.id)) {
              send(other.peer, {
                type: 'module:announced',
                data: { name, index, identity },
                metadata: createServerEventMetadata(instanceId, event.metadata?.event?.id),
              })
            }
          }

          return
        }

        case 'ui:configure': {
          const data = getEventData(event)
          const moduleName = typeof data?.moduleName === 'string'
            ? data.moduleName
            : isPluginMetadataEventSource(data?.identity)
              ? data.identity.plugin.id
              : ''
          const moduleIndex = typeof data?.moduleIndex === 'number' ? data.moduleIndex : undefined
          const config = isRecord(data?.config) ? data.config : undefined

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
              data: { config: config || {} },
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
            send(peer, RESPONSES.notAuthenticated(instanceId, event.metadata?.event?.id))
            return
          }

          const data = getEventData(event)
          const eventName = typeof data?.event === 'string' ? data.event : ''
          const mode = (data?.mode === 'consumer' || data?.mode === 'consumer-group')
            ? data.mode
            : (typeof data?.group === 'string' && data.group ? 'consumer-group' : 'consumer')
          const group = typeof data?.group === 'string' ? data.group : undefined
          const priority = typeof data?.priority === 'number' ? data.priority : undefined

          if (!eventName || typeof eventName !== 'string') {
            send(peer, RESPONSES.error(ServerErrorMessages.moduleConsumerEventInvalid, instanceId, event.metadata?.event?.id))
            return
          }

          registerConsumer(peer.id, eventName, mode, group, priority)
          return
        }

        case 'module:consumer:unregister': {
          const p = peers.get(peer.id)
          if (!p?.authenticated) {
            send(peer, RESPONSES.notAuthenticated(instanceId, event.metadata?.event?.id))
            return
          }

          const data = getEventData(event)
          const eventName = typeof data?.event === 'string' ? data.event : ''
          const mode = (data?.mode === 'consumer' || data?.mode === 'consumer-group')
            ? data.mode
            : (typeof data?.group === 'string' && data.group ? 'consumer-group' : 'consumer')
          const group = typeof data?.group === 'string' ? data.group : undefined

          if (!eventName || typeof eventName !== 'string') {
            send(peer, RESPONSES.error(ServerErrorMessages.moduleConsumerEventInvalid, instanceId, event.metadata?.event?.id))
            return
          }

          unregisterConsumer(peer.id, eventName, mode, group)
          return
        }
      }

      // default case
      const p = peers.get(peer.id)
      if (!p?.authenticated) {
        logger.withFields({ peer: peer.id, peerName: p?.name, peerRemote: peer.remoteAddress, peerRequest: peer.request.url }).debug('not authenticated')
        send(peer, RESPONSES.notAuthenticated(instanceId, event.metadata?.event?.id))

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
            send(peer, RESPONSES.error(ServerErrorMessages.noConsumerRegistered, instanceId, event.metadata?.event?.id))
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

          const delivered = send(selectedConsumer.peer, payload)
          if (!delivered) {
            peers.delete(selectedConsumer.peer.id)
            unregisterModulePeer(selectedConsumer, 'consumer send failed')
          }
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

      for (const [id, other] of Array.from(peers.entries())) {
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
          const delivered = send(other.peer, payload)
          if (!delivered) {
            peers.delete(id)
            unregisterModulePeer(other, 'send failed')
          }
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
      const safeDetails = (details ?? {}) as { code?: unknown, reason?: unknown, wasClean?: unknown }
      const closeCode = typeof safeDetails.code === 'number' ? safeDetails.code : undefined
      const closeReason = typeof safeDetails.reason === 'string' ? safeDetails.reason : undefined
      const closeWasClean = typeof safeDetails.wasClean === 'boolean'
        ? safeDetails.wasClean
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
        unregisterModulePeer(p, 'connection closed')
      }

      deletePendingSends(peer.id)
      cleanupStickyAssignments(now)

      logger.withFields({
        peer: peer.id,
        peerRemote: peer.remoteAddress,
        details,
        closeCode,
        closeReason,
        closeWasClean,
        activePeers: peers.size,
        peerAuthenticated: p?.authenticated,
        peerName: p?.name,
        peerIndex: p?.index,
        peerHealthy: p?.healthy,
        peerMissedHeartbeats: p?.missedHeartbeats,
        heartbeatLastSeenAt,
        heartbeatSilentForMs,
        heartbeatTtlMs,
        healthCheckIntervalMs,
        likelyHeartbeatExpiry,
        likelySilentNetworkClose,
      }).log('closed')

      peers.delete(peer.id)
    },
  }))

  function closeAllPeers() {
    clearInterval(healthCheckTimer)
    if (pendingFlushTimer) {
      clearTimeout(pendingFlushTimer)
      pendingFlushTimer = undefined
    }

    logger.withFields({ totalPeers: peers.size }).log('closing all peers')

    const peersToClose = Array.from(peers.values())
    for (const peer of peersToClose) {
      logger.withFields({ peer: peer.peer.id, peerName: peer.name }).debug('closing peer')
      try {
        peer.peer.close?.()
      }
      catch (error) {
        logger.withFields({ peer: peer.peer.id, peerName: peer.name }).withError(error as Error).debug('failed to close peer during shutdown')
      }
    }

    pendingOutboundByPeer.clear()
    stickyAssignments.clear()
    stickyAssignmentTimestamps.clear()
    consumerRegistry.clear()
    consumerKeysByPeer.clear()
    deliveryRoundRobinCursor.clear()
    peersByModule.clear()
    peers.clear()
    peersRef = undefined
  }

  return {
    app,
    closeAllPeers,
  }
}
