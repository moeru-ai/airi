import type { DeliveryConfig } from '@proj-airi/server-shared/types'

const DEFAULT_CONSUMER_GROUP = 'default'

interface ConsumerRegistryRef {
  event: string
  group: string
}

/**
 * Candidate peer metadata used for AIRI consumer selection.
 */
export interface ConsumerSelectionCandidate {
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
 * Stored AIRI consumer registration.
 */
export interface ConsumerRegistration {
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
 * Sticky AIRI consumer assignment stored by the consumer selector.
 */
export interface ConsumerStickyAssignment {
  /** Protocol event type the sticky assignment belongs to. */
  event: string
  /** Normalized consumer group the sticky assignment belongs to. */
  group: string
  /** Peer selected for the sticky key. */
  peerId: string
}

/**
 * Checks whether a delivery mode targets the AIRI consumer registry.
 */
export function isConsumerDeliveryMode(mode: unknown): mode is 'consumer' | 'consumer-group' {
  return mode === 'consumer' || mode === 'consumer-group'
}

/**
 * Normalizes delivery mode for AIRI consumer registration.
 *
 * Before:
 * - undefined with group "workers"
 *
 * After:
 * - "consumer-group"
 */
export function normalizeConsumerMode(mode: unknown, group?: string): 'consumer' | 'consumer-group' {
  if (isConsumerDeliveryMode(mode)) {
    return mode
  }

  return group ? 'consumer-group' : 'consumer'
}

/**
 * Normalizes AIRI consumer priority.
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

function normalizeConsumerGroup(mode: 'consumer' | 'consumer-group', group?: string) {
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
 * Selects a concrete peer for AIRI consumer-style delivery modes.
 *
 * Sticky and round-robin state are keyed with structured JSON tuples so event,
 * group, and sticky key values may contain delimiter-like text safely.
 */
export function selectConsumerPeerId(options: {
  eventType: string
  fromPeerId: string
  delivery?: DeliveryConfig
  candidates: ConsumerSelectionCandidate[]
  roundRobinCursor?: Map<string, number>
  stickyAssignments?: Map<string, ConsumerStickyAssignment>
}) {
  const { candidates, delivery, eventType, fromPeerId } = options
  if (!delivery || !isConsumerDeliveryMode(delivery.mode)) {
    return
  }

  const normalizedGroup = normalizeConsumerGroup(delivery.mode, delivery.group)
  const registryKey = JSON.stringify([eventType, normalizedGroup])
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
    const stickyRegistryKey = JSON.stringify([eventType, normalizedGroup, delivery.stickyKey])
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
 * Creates the AIRI consumer delivery orchestrator for websocket peers.
 *
 * The orchestrator owns registration, unregister, listing, selection, and
 * sticky/round-robin cleanup state for AIRI consumer routing.
 */
export function createConsumerOrchestrator() {
  const consumerRegistry = new Map<string, Map<string, Map<string, ConsumerRegistration>>>()
  const consumerKeysByPeer = new Map<string, Map<string, ConsumerRegistryRef>>()
  const deliveryRoundRobinCursor = new Map<string, number>()
  const stickyAssignments = new Map<string, ConsumerStickyAssignment>()

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
    register(input: { peerId: string, event: string, mode: 'consumer' | 'consumer-group', group?: string, priority?: number }) {
      const normalizedGroup = normalizeConsumerGroup(input.mode, input.group)
      const registryKey = JSON.stringify([input.event, normalizedGroup])
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
    unregister(input: { peerId: string, event: string, mode: 'consumer' | 'consumer-group', group?: string }) {
      const normalizedGroup = normalizeConsumerGroup(input.mode, input.group)
      const registryKey = JSON.stringify([input.event, normalizedGroup])
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
        deliveryRoundRobinCursor.delete(JSON.stringify([event, group]))
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
    listFor(input: { event: string, mode: 'consumer' | 'consumer-group', group?: string }) {
      const normalizedGroup = normalizeConsumerGroup(input.mode, input.group)
      return [...consumerRegistry.get(input.event)?.get(normalizedGroup)?.values() ?? []]
    },
    select(input: {
      eventType: string
      fromPeerId: string
      delivery?: DeliveryConfig
      candidates: ConsumerSelectionCandidate[]
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
