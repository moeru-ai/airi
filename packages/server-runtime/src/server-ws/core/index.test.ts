import type { ServerWsStickyAssignment } from '.'

import { describe, expect, it } from 'vitest'

import {
  createConsumerOrchestrator,
  selectConsumerPeerId,
} from '.'

describe('server-ws consumer selection', () => {
  it('selects highest priority then earliest registration', () => {
    expect(selectConsumerPeerId({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer', selection: 'first' },
      candidates: [
        { peerId: 'late', priority: 1, registeredAt: 2, authenticated: true },
        { peerId: 'early', priority: 1, registeredAt: 1, authenticated: true },
        { peerId: 'low', priority: 0, registeredAt: 0, authenticated: true },
      ],
    })).toBe('early')
  })

  it('skips sender, unauthenticated, and unhealthy candidates', () => {
    expect(selectConsumerPeerId({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer', selection: 'first' },
      candidates: [
        { peerId: 'sender', priority: 3, registeredAt: 1, authenticated: true },
        { peerId: 'unauthenticated', priority: 2, registeredAt: 1, authenticated: false },
        { peerId: 'unhealthy', priority: 1, registeredAt: 1, authenticated: true, healthy: false },
        { peerId: 'target', priority: 0, registeredAt: 1, authenticated: true },
      ],
    })).toBe('target')
  })

  it('preserves sticky assignment for the same sticky key', () => {
    const stickyAssignments = new Map<string, ServerWsStickyAssignment>()
    const delivery = { mode: 'consumer-group' as const, group: 'workers', selection: 'sticky' as const, stickyKey: 'job-1' }
    const candidates = [
      { peerId: 'a', priority: 0, registeredAt: 1, authenticated: true },
      { peerId: 'b', priority: 0, registeredAt: 2, authenticated: true },
    ]

    expect(selectConsumerPeerId({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery,
      candidates,
      stickyAssignments,
    })).toBe('a')
    expect(selectConsumerPeerId({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery,
      candidates: [...candidates].reverse(),
      stickyAssignments,
    })).toBe('a')
  })

  it('preserves round-robin cursor per event and group', () => {
    const roundRobinCursor = new Map<string, number>()
    const delivery = { mode: 'consumer-group' as const, group: 'workers', selection: 'round-robin' as const }
    const candidates = [
      { peerId: 'a', priority: 0, registeredAt: 1, authenticated: true },
      { peerId: 'b', priority: 0, registeredAt: 2, authenticated: true },
    ]

    expect(selectConsumerPeerId({ eventType: 'event:test', fromPeerId: 'sender', delivery, candidates, roundRobinCursor })).toBe('a')
    expect(selectConsumerPeerId({ eventType: 'event:test', fromPeerId: 'sender', delivery, candidates, roundRobinCursor })).toBe('b')
    expect(selectConsumerPeerId({ eventType: 'event:test', fromPeerId: 'sender', delivery, candidates, roundRobinCursor })).toBe('a')
  })
})

describe('server-ws consumer registry', () => {
  it('registers and unregisters consumers', () => {
    const registry = createConsumerOrchestrator()

    registry.register({ peerId: 'peer-1', event: 'event:test', mode: 'consumer-group', group: 'workers', priority: 2 })
    expect(registry.listFor({ event: 'event:test', mode: 'consumer-group', group: 'workers' })).toEqual([
      expect.objectContaining({ peerId: 'peer-1', event: 'event:test', group: 'workers', priority: 2 }),
    ])

    registry.unregister({ peerId: 'peer-1', event: 'event:test', mode: 'consumer-group', group: 'workers' })
    expect(registry.listFor({ event: 'event:test', mode: 'consumer-group', group: 'workers' })).toEqual([])
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
    registry.register({ peerId: 'peer-1', event: 'event::test', mode: 'consumer-group', group: 'group::workers' })
    registry.unregisterPeer('peer-1')

    expect(registry.listFor({ event: 'event::test', mode: 'consumer-group', group: 'group::workers' })).toEqual([])
  })

  it('keeps sticky assignments isolated for delimiter-like event and group names', () => {
    const stickyAssignments = new Map<string, ServerWsStickyAssignment>()
    const candidates = [
      { peerId: 'event::group-target', priority: 0, registeredAt: 1, authenticated: true },
      { peerId: 'other-target', priority: 0, registeredAt: 2, authenticated: true },
    ]

    expect(selectConsumerPeerId({
      eventType: 'event::group',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer-group', group: 'target', selection: 'sticky', stickyKey: 'job' },
      candidates,
      stickyAssignments,
    })).toBe('event::group-target')
    expect(selectConsumerPeerId({
      eventType: 'event',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer-group', group: 'group::target', selection: 'sticky', stickyKey: 'job' },
      candidates: [
        { peerId: 'other-target', priority: 1, registeredAt: 1, authenticated: true },
        { peerId: 'event::group-target', priority: 0, registeredAt: 2, authenticated: true },
      ],
      stickyAssignments,
    })).toBe('other-target')
  })

  it('resets round-robin cursor when group membership changes', () => {
    const registry = createConsumerOrchestrator()
    registry.register({ peerId: 'a', event: 'event:test', mode: 'consumer-group', group: 'workers' })
    registry.register({ peerId: 'b', event: 'event:test', mode: 'consumer-group', group: 'workers' })

    expect(registry.select({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer-group', group: 'workers', selection: 'round-robin' },
      candidates: registry.listFor({ event: 'event:test', mode: 'consumer-group', group: 'workers' }).map(entry => ({
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
        authenticated: true,
      })),
    })).toBe('a')

    registry.unregister({ peerId: 'a', event: 'event:test', mode: 'consumer-group', group: 'workers' })

    expect(registry.select({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer-group', group: 'workers', selection: 'round-robin' },
      candidates: registry.listFor({ event: 'event:test', mode: 'consumer-group', group: 'workers' }).map(entry => ({
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
        authenticated: true,
      })),
    })).toBe('b')
  })

  it('keeps round-robin cursor when unregister does not change group membership', () => {
    const registry = createConsumerOrchestrator()
    registry.register({ peerId: 'a', event: 'event:test', mode: 'consumer-group', group: 'workers' })
    registry.register({ peerId: 'b', event: 'event:test', mode: 'consumer-group', group: 'workers' })

    expect(registry.select({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer-group', group: 'workers', selection: 'round-robin' },
      candidates: registry.listFor({ event: 'event:test', mode: 'consumer-group', group: 'workers' }).map(entry => ({
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
        authenticated: true,
      })),
    })).toBe('a')

    registry.unregister({ peerId: 'missing', event: 'event:test', mode: 'consumer-group', group: 'workers' })

    expect(registry.select({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer-group', group: 'workers', selection: 'round-robin' },
      candidates: registry.listFor({ event: 'event:test', mode: 'consumer-group', group: 'workers' }).map(entry => ({
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
        authenticated: true,
      })),
    })).toBe('b')
  })

  it('resets round-robin cursor when group membership grows', () => {
    const registry = createConsumerOrchestrator()
    registry.register({ peerId: 'a', event: 'event:test', mode: 'consumer-group', group: 'workers' })
    registry.register({ peerId: 'b', event: 'event:test', mode: 'consumer-group', group: 'workers' })

    expect(registry.select({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer-group', group: 'workers', selection: 'round-robin' },
      candidates: registry.listFor({ event: 'event:test', mode: 'consumer-group', group: 'workers' }).map(entry => ({
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
        authenticated: true,
      })),
    })).toBe('a')

    registry.register({ peerId: 'c', event: 'event:test', mode: 'consumer-group', group: 'workers' })

    expect(registry.select({
      eventType: 'event:test',
      fromPeerId: 'sender',
      delivery: { mode: 'consumer-group', group: 'workers', selection: 'round-robin' },
      candidates: registry.listFor({ event: 'event:test', mode: 'consumer-group', group: 'workers' }).map(entry => ({
        peerId: entry.peerId,
        priority: entry.priority,
        registeredAt: entry.registeredAt,
        authenticated: true,
      })),
    })).toBe('a')
  })
})
