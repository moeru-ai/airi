/**
 * Delivery settings used by the reusable websocket gateway.
 *
 * @param TMode - Delivery mode literals accepted by the adapter.
 */
export interface ServerWsDeliveryConfig<TMode extends string = 'broadcast' | 'consumer' | 'consumer-group'> {
  /**
   * Delivery mode selected by the protocol adapter.
   *
   * @default undefined
   */
  mode?: TMode
  /**
   * Optional consumer group.
   *
   * @default "default" for consumer delivery modes.
   */
  group?: string
  /**
   * Selection strategy within the target consumer set.
   *
   * @default "first"
   */
  selection?: 'first' | 'priority' | 'sticky' | 'round-robin'
  /**
   * Sticky routing key used when `selection` is `sticky`.
   *
   * @default undefined
   */
  stickyKey?: string
  /**
   * Whether missing consumers should be surfaced as an error by the adapter.
   *
   * @default false
   */
  required?: boolean
}

/**
 * Delivery settings accepted by the reusable consumer registry.
 *
 * @param TMode - Consumer delivery mode literals accepted by the adapter.
 */
export type ServerWsConsumerDeliveryConfig<TMode extends string = 'consumer' | 'consumer-group'> = ServerWsDeliveryConfig<TMode>

/**
 * Candidate peer metadata used for consumer selection.
 */
export interface ServerWsConsumerSelectionCandidate {
  /** Peer id available to receive the event. */
  peerId: string
  /** Higher values are selected before lower values. */
  priority: number
  /** Timestamp captured when the peer registered as a consumer. */
  registeredAt: number
  /** Whether the peer has completed protocol-level authentication. */
  authenticated: boolean
  /** Explicit `false` excludes the peer from selection. */
  healthy?: boolean
}

/**
 * Stored consumer registration.
 */
export interface ServerWsConsumerRegistration {
  /** Protocol event type consumed by the peer. */
  event: string
  /** Normalized consumer group name. */
  group: string
  /** Peer id that registered for the event/group pair. */
  peerId: string
  /** Higher values are selected before lower values. */
  priority: number
  /** Timestamp captured when the peer registered as a consumer. */
  registeredAt: number
}

/**
 * Describes protocol-agnostic text encoding and decoding for websocket events.
 *
 * @param TEvent - Event envelope shape owned by the protocol adapter.
 */
export interface ServerWsEventCodec<TEvent> {
  /** Parses one text payload into a protocol event. */
  parse: (text: string) => TEvent
  /** Serializes one protocol event or pre-serialized payload for peer sending. */
  stringify: (event: TEvent | string) => string
  /** Detects raw transport control payloads that should not enter protocol routing. */
  detectControlFrame?: (text: string) => string | undefined
}

/**
 * Describes a websocket handler object accepted by H3 `defineWebSocketHandler`.
 *
 * @param TPeer - Runtime peer object accepted by lifecycle callbacks.
 * @param TMessage - Runtime message object accepted by the message callback.
 * @param TCloseDetails - Runtime close details object accepted by the close callback.
 */
export interface ServerWsGatewayHandler<TPeer = unknown, TMessage = unknown, TCloseDetails = unknown> {
  /** Called when a peer opens a websocket connection. */
  open?: (peer: TPeer) => void
  /** Called when a peer sends one websocket message. */
  message?: (peer: TPeer, message: TMessage) => void
  /** Called when the websocket runtime reports an error. */
  error?: (peer: TPeer, error: unknown) => void
  /** Called when a peer closes a websocket connection. */
  close?: (peer: TPeer, details?: TCloseDetails) => void
}

/**
 * Minimal websocket peer shape used by the reusable gateway.
 */
export interface ServerWsPeer {
  /** Stable peer id assigned by the websocket runtime. */
  get id(): string
  /** Sends one payload to the peer. */
  send: (data: unknown, options?: { compress?: boolean }) => number | void | undefined
  /** Closes the peer connection when the runtime exposes an explicit close hook. */
  close?: () => void
  /** WebSocket ready state when exposed by the runtime. */
  readyState?: number
  /** Request metadata associated with the websocket upgrade. */
  request?: {
    /** Request URL associated with the websocket upgrade. */
    url?: string
    /** Request headers associated with the websocket upgrade. */
    headers?: Headers
  }
  /** Remote peer address when exposed by the runtime. */
  remoteAddress?: string
}

/** Default heartbeat read timeout used by the websocket gateway. */
export const serverWsDefaultHeartbeatTtlMs = 60_000

/** Miss count where a peer becomes unhealthy but remains connected. */
export const serverWsHealthCheckMissesUnhealthy = 5

/** Miss count where a peer is considered dead and should be closed. */
export const serverWsHealthCheckMissesDead = serverWsHealthCheckMissesUnhealthy * 2

const DEFAULT_CONSUMER_GROUP = 'default'

interface ServerWsConsumerRegistryRef {
  event: string
  group: string
}

/**
 * Sticky consumer assignment stored by the reusable consumer selector.
 */
export interface ServerWsStickyAssignment {
  /** Protocol event type the sticky assignment belongs to. */
  event: string
  /** Normalized consumer group the sticky assignment belongs to. */
  group: string
  /** Peer selected for the sticky key. */
  peerId: string
}

/**
 * Creates a websocket event codec from explicit parser and serializer callbacks.
 *
 * Use when:
 * - A protocol adapter wants to plug its own event envelope into `server-ws/core`
 *
 * Expects:
 * - Parser and serializer preserve the adapter's current wire format
 *
 * Returns:
 * - A protocol-agnostic codec object consumed by gateway code
 */
export function createEventCodec<TEvent>(codec: ServerWsEventCodec<TEvent>) {
  return codec
}

/**
 * Wraps websocket lifecycle callbacks and disposal as a reusable mount object.
 *
 * Use when:
 * - Adapters need one stable lifecycle shape for server mounting
 *
 * Expects:
 * - `handler` contains already-bound protocol behavior
 *
 * Returns:
 * - A handler plus idempotent disposal hook
 */
export function createGatewayLifecycle<TPeer, TMessage, TCloseDetails = unknown>(input: {
  handler: ServerWsGatewayHandler<TPeer, TMessage, TCloseDetails>
  dispose?: () => void
}) {
  let disposed = false

  return {
    handler: input.handler,
    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      input.dispose?.()
    },
  }
}

/**
 * Resolves the interval used for heartbeat health checks.
 *
 * Use when:
 * - Gateway code needs to convert heartbeat TTL into periodic miss checks
 *
 * Expects:
 * - Very small TTL values should still avoid busy intervals
 *
 * Returns:
 * - Interval in milliseconds
 */
export function resolveServerWsHealthCheckIntervalMs(heartbeatTtlMs: number) {
  return Math.max(5_000, Math.floor(heartbeatTtlMs / serverWsHealthCheckMissesUnhealthy))
}

/**
 * Creates a typed peer store around websocket peer state.
 *
 * Use when:
 * - A gateway needs stable peer lookup, iteration, and cleanup
 *
 * Expects:
 * - `TState` contains protocol-specific peer state
 *
 * Returns:
 * - A small registry over peers keyed by peer id
 */
export function createServerWsPeerStore<TState extends { peer: ServerWsPeer }>() {
  const peers = new Map<string, TState>()

  return {
    peers,
    get(peerId: string) {
      return peers.get(peerId)
    },
    set(peerId: string, state: TState) {
      peers.set(peerId, state)
      return state
    },
    delete(peerId: string) {
      return peers.delete(peerId)
    },
    clear() {
      peers.clear()
    },
    values() {
      return peers.values()
    },
    entries() {
      return peers.entries()
    },
    size() {
      return peers.size
    },
  }
}

/**
 * Checks whether a delivery mode targets the consumer registry.
 *
 * Use when:
 * - A protocol adapter receives broad delivery modes but must call consumer-only APIs
 *
 * Expects:
 * - Non-consumer modes such as `broadcast` should remain outside the consumer registry
 *
 * Returns:
 * - `true` for `consumer` and `consumer-group`
 */
export function isConsumerDeliveryMode(mode: unknown): mode is ServerWsConsumerDeliveryConfig['mode'] {
  return mode === 'consumer' || mode === 'consumer-group'
}

/**
 * Normalizes delivery mode for consumer registration.
 *
 * Before:
 * - undefined with group "workers"
 *
 * After:
 * - "consumer-group"
 */
export function normalizeConsumerMode(mode: unknown, group?: string): 'consumer' | 'consumer-group' {
  if (isConsumerDeliveryMode(mode)) {
    return mode!
  }

  return group ? 'consumer-group' : 'consumer'
}

/**
 * Normalizes consumer priority.
 *
 * Before:
 * - NaN
 *
 * After:
 * - 0
 */
export function normalizeConsumerPriority(priority: unknown) {
  return typeof priority === 'number' && Number.isFinite(priority)
    ? priority
    : 0
}

function normalizeConsumerGroup(mode: ServerWsConsumerDeliveryConfig['mode'], group?: string) {
  if (mode === 'consumer') {
    return DEFAULT_CONSUMER_GROUP
  }

  return group || DEFAULT_CONSUMER_GROUP
}

function getConsumerRegistryKey(event: string, group: string) {
  return JSON.stringify([event, group])
}

function getStickyRegistryKey(event: string, group: string, stickyKey: string) {
  return JSON.stringify([event, group, stickyKey])
}

function sortConsumers(entries: Array<Pick<ServerWsConsumerSelectionCandidate, 'peerId' | 'priority' | 'registeredAt'>>) {
  return [...entries].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority
    }

    return left.registeredAt - right.registeredAt
  })
}

/**
 * Selects a concrete consumer peer for consumer-style delivery modes.
 *
 * Use when:
 * - An event should be sent to exactly one registered consumer
 * - Sticky or round-robin routing needs to be resolved against live peer metadata
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
  delivery?: ServerWsDeliveryConfig
  candidates: ServerWsConsumerSelectionCandidate[]
  roundRobinCursor?: Map<string, number>
  stickyAssignments?: Map<string, ServerWsStickyAssignment>
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
    const stickyRegistryKey = getStickyRegistryKey(eventType, normalizedGroup, delivery.stickyKey)
    const stickyAssignment = options.stickyAssignments?.get(stickyRegistryKey)
    if (stickyAssignment && stickyAssignment.peerId !== fromPeerId) {
      const stickyCandidate = availableEntries.find(entry => entry.peerId === stickyAssignment.peerId)
      if (stickyCandidate) {
        return stickyAssignment.peerId
      }
    }

    const selected = availableEntries[0]
    options.stickyAssignments?.set(stickyRegistryKey, { event: eventType, group: normalizedGroup, peerId: selected.peerId })
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

/**
 * Creates a reusable consumer delivery orchestrator for websocket peers.
 *
 * Use when:
 * - A protocol adapter supports one-consumer delivery or consumer groups
 *
 * Expects:
 * - Peer liveness is checked by the caller before delivery
 *
 * Returns:
 * - Registration, unregister, listing, selection, and cleanup helpers
 */
export function createConsumerOrchestrator() {
  const consumerRegistry = new Map<string, Map<string, Map<string, ServerWsConsumerRegistration>>>()
  const consumerKeysByPeer = new Map<string, Map<string, ServerWsConsumerRegistryRef>>()
  const deliveryRoundRobinCursor = new Map<string, number>()
  const stickyAssignments = new Map<string, ServerWsStickyAssignment>()

  function removeStickyAssignmentsFor(event: string, group: string, peerId?: string) {
    for (const [stickyKey, assignment] of stickyAssignments.entries()) {
      if (peerId && assignment.peerId !== peerId) {
        continue
      }

      if (assignment.event === event && assignment.group === group) {
        stickyAssignments.delete(stickyKey)
      }
    }
  }

  return {
    register(input: { peerId: string, event: string, mode: ServerWsConsumerDeliveryConfig['mode'], group?: string, priority?: number }) {
      const normalizedGroup = normalizeConsumerGroup(input.mode, input.group)
      const registryKey = getConsumerRegistryKey(input.event, normalizedGroup)
      let groups = consumerRegistry.get(input.event)
      if (!groups) {
        groups = new Map()
        consumerRegistry.set(input.event, groups)
      }

      let peersForGroup = groups.get(normalizedGroup)
      if (!peersForGroup) {
        peersForGroup = new Map()
        groups.set(normalizedGroup, peersForGroup)
      }

      const didGrowMembership = !peersForGroup.has(input.peerId)
      peersForGroup.set(input.peerId, {
        event: input.event,
        group: normalizedGroup,
        peerId: input.peerId,
        priority: normalizeConsumerPriority(input.priority),
        registeredAt: Date.now(),
      })
      if (didGrowMembership) {
        deliveryRoundRobinCursor.delete(registryKey)
      }

      let registrations = consumerKeysByPeer.get(input.peerId)
      if (!registrations) {
        registrations = new Map()
        consumerKeysByPeer.set(input.peerId, registrations)
      }
      registrations.set(registryKey, { event: input.event, group: normalizedGroup })
    },
    unregister(input: { peerId: string, event: string, mode: ServerWsConsumerDeliveryConfig['mode'], group?: string }) {
      const normalizedGroup = normalizeConsumerGroup(input.mode, input.group)
      const registryKey = getConsumerRegistryKey(input.event, normalizedGroup)
      const groups = consumerRegistry.get(input.event)
      const peersForGroup = groups?.get(normalizedGroup)
      const didDelete = peersForGroup?.delete(input.peerId) ?? false

      if (!didDelete) {
        return
      }

      deliveryRoundRobinCursor.delete(registryKey)
      if (peersForGroup?.size === 0) {
        groups?.delete(normalizedGroup)
      }
      if (groups?.size === 0) {
        consumerRegistry.delete(input.event)
      }

      const registrations = consumerKeysByPeer.get(input.peerId)
      registrations?.delete(registryKey)
      if (registrations?.size === 0) {
        consumerKeysByPeer.delete(input.peerId)
      }

      removeStickyAssignmentsFor(input.event, normalizedGroup, input.peerId)
    },
    unregisterPeer(peerId: string) {
      const registrations = consumerKeysByPeer.get(peerId)
      if (!registrations?.size) {
        return
      }

      for (const registration of registrations.values()) {
        const { event, group } = registration
        const groups = consumerRegistry.get(event)
        const peersForGroup = groups?.get(group)
        peersForGroup?.delete(peerId)
        deliveryRoundRobinCursor.delete(getConsumerRegistryKey(event, group))
        if (peersForGroup?.size === 0) {
          groups?.delete(group)
        }
        if (groups?.size === 0) {
          consumerRegistry.delete(event)
        }

        removeStickyAssignmentsFor(event, group, peerId)
      }

      consumerKeysByPeer.delete(peerId)
    },
    listFor(input: { event: string, mode: ServerWsConsumerDeliveryConfig['mode'], group?: string }) {
      const normalizedGroup = normalizeConsumerGroup(input.mode, input.group)
      return [...consumerRegistry.get(input.event)?.get(normalizedGroup)?.values() ?? []]
    },
    select(input: {
      eventType: string
      fromPeerId: string
      delivery?: ServerWsDeliveryConfig
      candidates: ServerWsConsumerSelectionCandidate[]
    }) {
      return selectConsumerPeerId({
        ...input,
        roundRobinCursor: deliveryRoundRobinCursor,
        stickyAssignments,
      })
    },
    clear() {
      consumerRegistry.clear()
      consumerKeysByPeer.clear()
      deliveryRoundRobinCursor.clear()
      stickyAssignments.clear()
    },
  }
}
