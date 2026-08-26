import type { ConsumerStickyAssignment } from './consumers'

import { describe, expect, it } from 'vitest'

import {
  createConsumerOrchestrator,
  selectConsumerPeerId,
} from './consumers'

describe('airi websocket consumer selection', () => {
  it('selects highest priority then earliest registration', () => {
    expect(selectConsumerPeerId({
      candidates: [
        { authenticated: true, peerId: 'late', priority: 1, registeredAt: 2 },
        { authenticated: true, peerId: 'early', priority: 1, registeredAt: 1 },
        { authenticated: true, peerId: 'low', priority: 0, registeredAt: 0 },
      ],
      delivery: { mode: 'consumer', selection: 'first' },
      eventType: 'event:test',
      fromPeerId: 'sender',
    })).toBe('early')
  })

  it('skips sender, unauthenticated, and unhealthy candidates', () => {
    expect(selectConsumerPeerId({
      candidates: [
        { authenticated: true, peerId: 'sender', priority: 3, registeredAt: 1 },
        { authenticated: false, peerId: 'unauthenticated', priority: 2, registeredAt: 1 },
        { authenticated: true, healthy: false, peerId: 'unhealthy', priority: 1, registeredAt: 1 },
        { authenticated: true, peerId: 'target', priority: 0, registeredAt: 1 },
      ],
      delivery: { mode: 'consumer', selection: 'first' },
      eventType: 'event:test',
      fromPeerId: 'sender',
    })).toBe('target')
  })

  it('preserves sticky assignment for the same sticky key', () => {
    const stickyAssignments = new Map<string, ConsumerStickyAssignment>()
    const delivery = { group: 'workers', mode: 'consumer-group' as const, selection: 'sticky' as const, stickyKey: 'job-1' }
    const candidates = [
      { authenticated: true, peerId: 'a', priority: 0, registeredAt: 1 },
      { authenticated: true, peerId: 'b', priority: 0, registeredAt: 2 },
    ]

    expect(selectConsumerPeerId({
      candidates,
      delivery,
      eventType: 'event:test',
      fromPeerId: 'sender',
      stickyAssignments,
    })).toBe('a')
    expect(selectConsumerPeerId({
      candidates: [...candidates].reverse(),
      delivery,
      eventType: 'event:test',
      fromPeerId: 'sender',
      stickyAssignments,
    })).toBe('a')
  })

  it('preserves round-robin cursor per event and group', () => {
    const roundRobinCursor = new Map<string, number>()
    const delivery = { group: 'workers', mode: 'consumer-group' as const, selection: 'round-robin' as const }
    const candidates = [
      { authenticated: true, peerId: 'a', priority: 0, registeredAt: 1 },
      { authenticated: true, peerId: 'b', priority: 0, registeredAt: 2 },
    ]

    expect(selectConsumerPeerId({ candidates, delivery, eventType: 'event:test', fromPeerId: 'sender', roundRobinCursor })).toBe('a')
    expect(selectConsumerPeerId({ candidates, delivery, eventType: 'event:test', fromPeerId: 'sender', roundRobinCursor })).toBe('b')
    expect(selectConsumerPeerId({ candidates, delivery, eventType: 'event:test', fromPeerId: 'sender', roundRobinCursor })).toBe('a')
  })
})

describe('airi websocket consumer registry', () => {
  it('registers and unregisters consumers', () => {
    const registry = createConsumerOrchestrator()

    registry.register({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'peer-1', priority: 2 })
    expect(registry.listFor({ event: 'event:test', group: 'workers', mode: 'consumer-group' })).toEqual([
      expect.objectContaining({ event: 'event:test', group: 'workers', peerId: 'peer-1', priority: 2 }),
    ])

    registry.unregister({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'peer-1' })
    expect(registry.listFor({ event: 'event:test', group: 'workers', mode: 'consumer-group' })).toEqual([])
  })

  it('unregisters peer consumers when event and group names contain registry delimiters', () => {
    const registry = createConsumerOrchestrator()

    // ROOT CAUSE:
    //
    // If event or group names contain the previous string key delimiter, peer cleanup
    // can fail because unregisterPeer reconstructs registry coordinates from a split key.
    //
    // Before:
    // `${event}::${group}` was split back into event/group and missed the original entry.
    //
    // After:
    // Peer cleanup stores structured event/group refs and never decodes registry keys.
    registry.register({ event: 'event::test', group: 'group::workers', mode: 'consumer-group', peerId: 'peer-1' })
    registry.unregisterPeer('peer-1')

    expect(registry.listFor({ event: 'event::test', group: 'group::workers', mode: 'consumer-group' })).toEqual([])
  })

  it('keeps sticky assignments isolated for delimiter-like event and group names', () => {
    const stickyAssignments = new Map<string, ConsumerStickyAssignment>()
    const candidates = [
      { authenticated: true, peerId: 'event::group-target', priority: 0, registeredAt: 1 },
      { authenticated: true, peerId: 'other-target', priority: 0, registeredAt: 2 },
    ]

    expect(selectConsumerPeerId({
      candidates,
      delivery: { group: 'target', mode: 'consumer-group', selection: 'sticky', stickyKey: 'job' },
      eventType: 'event::group',
      fromPeerId: 'sender',
      stickyAssignments,
    })).toBe('event::group-target')
    expect(selectConsumerPeerId({
      candidates: [
        { authenticated: true, peerId: 'other-target', priority: 1, registeredAt: 1 },
        { authenticated: true, peerId: 'event::group-target', priority: 0, registeredAt: 2 },
      ],
      delivery: { group: 'group::target', mode: 'consumer-group', selection: 'sticky', stickyKey: 'job' },
      eventType: 'event',
      fromPeerId: 'sender',
      stickyAssignments,
    })).toBe('other-target')
  })

  it('resets round-robin cursor when group membership changes', () => {
    const registry = createConsumerOrchestrator()
    registry.register({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'a' })
    registry.register({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'b' })

    expect(registry.select({
      candidates: registry.listFor({ event: 'event:test', group: 'workers', mode: 'consumer-group' }).map(entry => ({
        authenticated: true,
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
      })),
      delivery: { group: 'workers', mode: 'consumer-group', selection: 'round-robin' },
      eventType: 'event:test',
      fromPeerId: 'sender',
    })).toBe('a')

    registry.unregister({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'a' })

    expect(registry.select({
      candidates: registry.listFor({ event: 'event:test', group: 'workers', mode: 'consumer-group' }).map(entry => ({
        authenticated: true,
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
      })),
      delivery: { group: 'workers', mode: 'consumer-group', selection: 'round-robin' },
      eventType: 'event:test',
      fromPeerId: 'sender',
    })).toBe('b')
  })

  it('keeps round-robin cursor when unregister does not change group membership', () => {
    const registry = createConsumerOrchestrator()
    registry.register({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'a' })
    registry.register({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'b' })

    expect(registry.select({
      candidates: registry.listFor({ event: 'event:test', group: 'workers', mode: 'consumer-group' }).map(entry => ({
        authenticated: true,
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
      })),
      delivery: { group: 'workers', mode: 'consumer-group', selection: 'round-robin' },
      eventType: 'event:test',
      fromPeerId: 'sender',
    })).toBe('a')

    registry.unregister({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'missing' })

    expect(registry.select({
      candidates: registry.listFor({ event: 'event:test', group: 'workers', mode: 'consumer-group' }).map(entry => ({
        authenticated: true,
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
      })),
      delivery: { group: 'workers', mode: 'consumer-group', selection: 'round-robin' },
      eventType: 'event:test',
      fromPeerId: 'sender',
    })).toBe('b')
  })

  it('resets round-robin cursor when group membership grows', () => {
    const registry = createConsumerOrchestrator()
    registry.register({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'a' })
    registry.register({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'b' })

    expect(registry.select({
      candidates: registry.listFor({ event: 'event:test', group: 'workers', mode: 'consumer-group' }).map(entry => ({
        authenticated: true,
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
      })),
      delivery: { group: 'workers', mode: 'consumer-group', selection: 'round-robin' },
      eventType: 'event:test',
      fromPeerId: 'sender',
    })).toBe('a')

    registry.register({ event: 'event:test', group: 'workers', mode: 'consumer-group', peerId: 'c' })

    expect(registry.select({
      candidates: registry.listFor({ event: 'event:test', group: 'workers', mode: 'consumer-group' }).map(entry => ({
        authenticated: true,
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
      })),
      delivery: { group: 'workers', mode: 'consumer-group', selection: 'round-robin' },
      eventType: 'event:test',
      fromPeerId: 'sender',
    })).toBe('a')
  })
})
