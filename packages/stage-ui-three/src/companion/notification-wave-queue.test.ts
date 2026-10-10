import type { MotionControllerSnapshot } from '../motions/types'
import type { NotificationWaveContext, NotificationWaveDecision, NotificationWaveIntent } from './notification-wave-queue'

import { describe, expect, it } from 'vitest'

import { notificationMotionOwner, NotificationWaveQueue } from './notification-wave-queue'

function snapshot(overrides: Partial<MotionControllerSnapshot> = {}): MotionControllerSnapshot {
  return { activeId: 'default-idle', idleId: 'default-idle', loadingId: undefined, queuedIds: [], cachedClipCount: 1, error: undefined, ...overrides }
}

function context(overrides: Partial<NotificationWaveContext> = {}): NotificationWaveContext {
  return {
    modelId: 'model-instance-1',
    snapshot: snapshot(),
    manipulationActive: false,
    gameActive: false,
    userMotionActive: false,
    paused: false,
    doNotDisturb: false,
    reducedMotion: false,
    enabled: true,
    waveAvailable: true,
    ...overrides,
  }
}

function intent(overrides: Partial<NotificationWaveIntent> = {}): NotificationWaveIntent {
  return { modelId: 'model-instance-1', eventId: 'event-1', intentId: 'intent-1', createdAt: 0, expiresAt: 5000, ...overrides }
}

function start(decision: NotificationWaveDecision) {
  expect(decision.kind).toBe('start')
  if (decision.kind !== 'start')
    throw new Error('Expected a wave lease')
  return decision.lease
}

describe('notification motion ownership', () => {
  it('prioritizes pause, manipulation, games, user work, then other busy motion', () => {
    expect(notificationMotionOwner(context({ manipulationActive: true, gameActive: true, userMotionActive: true }))).toBe('manual')
    expect(notificationMotionOwner(context({ gameActive: true, userMotionActive: true }))).toBe('game')
    expect(notificationMotionOwner(context({ userMotionActive: true }))).toBe('user')
    expect(notificationMotionOwner(context({ manipulationActive: true, paused: true }))).toBe('suppressed')
    expect(notificationMotionOwner(context({ snapshot: snapshot({ loadingId: 'dance' }) }))).toBe('busy')
    expect(notificationMotionOwner(context({ snapshot: snapshot({ queuedIds: ['dance'] }) }))).toBe('busy')
    expect(notificationMotionOwner(context({ snapshot: snapshot({ activeId: 'dance' }) }))).toBe('busy')
    expect(notificationMotionOwner(context())).toBe('idle')
  })

  it('does not infer idle from missing ownership or an unavailable model', () => {
    expect(notificationMotionOwner(context({ snapshot: undefined }))).toBe('unknown')
    expect(notificationMotionOwner(context({ modelId: undefined }))).toBe('unknown')
  })
})

describe('notification wave queue', () => {
  it('waits for busy playback and starts one wave after returning to idle', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    const busy = context({ snapshot: snapshot({ activeId: 'dance' }) })
    expect(queue.enqueue(intent(), busy, 0)).toBe('queued')
    expect(queue.next(busy, 100).kind).toBe('wait')
    expect(queue.pendingCount).toBe(1)
    const lease = start(queue.next(context(), 200))
    expect(lease.eventIds).toEqual(['event-1'])
    expect(lease.motionId).toBe('wave')
    expect(lease.loop).toBe(false)
    expect(lease.duration).toBe(5)
    expect(queue.pendingCount).toBe(0)
    expect(queue.next(context(), 201).kind).toBe('wait')
    expect(queue.owns(lease.leaseId)).toBe(true)
  })

  it.each(['manipulationActive', 'gameActive', 'userMotionActive'] as const)('waits behind %s without discarding a fresh event', (flag) => {
    const queue = new NotificationWaveQueue('model-instance-1')
    const busy = context({ [flag]: true })
    expect(queue.enqueue(intent(), busy, 0)).toBe('queued')
    expect(queue.next(busy, 100).kind).toBe('wait')
    expect(start(queue.next(context(), 200)).eventIds).toEqual(['event-1'])
  })

  it('deduplicates source events and delivery IDs', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    expect(queue.enqueue(intent(), context(), 0)).toBe('queued')
    expect(queue.enqueue(intent({ intentId: 'different-delivery' }), context(), 0)).toBe('duplicate')
    expect(queue.enqueue(intent({ eventId: 'different-event' }), context(), 0)).toBe('duplicate')
    expect(queue.pendingCount).toBe(1)
  })

  it('coalesces bursts without extending an older expiry', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    expect(queue.enqueue(intent({ coalesceKey: 'reply', expiresAt: 1000 }), context(), 0)).toBe('queued')
    expect(queue.enqueue(intent({ eventId: 'event-2', intentId: 'intent-2', coalesceKey: 'reply' }), context(), 100)).toBe('coalesced')
    expect(queue.pendingCount).toBe(1)
    expect(queue.next(context({ gameActive: true }), 500).kind).toBe('wait')
    expect(queue.next(context(), 1000).kind).toBe('wait')
    expect(queue.pendingCount).toBe(0)
  })

  it('copies coalesced identities into one lease', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent({ coalesceKey: 'reply' }), context(), 0)
    queue.enqueue(intent({ eventId: 'event-2', intentId: 'intent-2', coalesceKey: 'reply' }), context(), 0)
    const lease = start(queue.next(context(), 1))
    expect(lease.eventIds).toEqual(['event-1', 'event-2'])
    lease.leaseId = 'changed-by-caller'
    expect(queue.owns('notification-wave:1')).toBe(true)
    expect(queue.owns(lease.leaseId)).toBe(false)
  })

  it('expires events while busy instead of waving late', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), context({ gameActive: true }), 0)
    expect(queue.next(context({ gameActive: true }), 4999).kind).toBe('wait')
    expect(queue.next(context(), 5000).kind).toBe('wait')
    expect(queue.pendingCount).toBe(0)
    expect(queue.enqueue(intent(), context(), 5001)).toBe('invalid')
  })

  it.each(['paused', 'doNotDisturb', 'reducedMotion'] as const)('clears work under %s and prevents replay', (flag) => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), context(), 0)
    expect(queue.next(context({ [flag]: true }), 1).kind).toBe('wait')
    expect(queue.pendingCount).toBe(0)
    expect(queue.enqueue(intent(), context(), 2)).toBe('duplicate')
    expect(queue.next(context(), 3).kind).toBe('wait')
  })

  it('consumes suppressed events without replaying them after DND', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    expect(queue.enqueue(intent(), context({ doNotDisturb: true }), 0)).toBe('suppressed')
    expect(queue.enqueue(intent(), context(), 1)).toBe('duplicate')
    expect(queue.pendingCount).toBe(0)
  })

  it('revokes its own lease when user control starts', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), context(), 0)
    const lease = start(queue.next(context(), 1))
    expect(queue.next(context({ manipulationActive: true }), 2)).toEqual({ kind: 'cancel', modelId: 'model-instance-1', leaseId: lease.leaseId, reason: 'preempted' })
    expect(queue.owns(lease.leaseId)).toBe(false)
    expect(queue.next(context(), 3).kind).toBe('wait')
  })

  it('keeps its active or loading wave but cancels conflicting controller work', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), context(), 0)
    start(queue.next(context(), 1))
    expect(queue.next(context({ snapshot: snapshot({ loadingId: 'wave' }) }), 2).kind).toBe('wait')
    expect(queue.next(context({ snapshot: snapshot({ activeId: 'wave' }) }), 3).kind).toBe('wait')
    expect(queue.next(context({ snapshot: snapshot({ loadingId: 'dance' }) }), 4).kind).toBe('cancel')
  })

  it('uses explicit ownership for user playback of the same wave ID', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), context(), 0)
    start(queue.next(context(), 1))
    expect(queue.next(context({ userMotionActive: true, snapshot: snapshot({ activeId: 'wave' }) }), 2).kind).toBe('cancel')
  })

  it('clears pending events on a model change and refuses foreign model intents', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), context(), 0)
    const lease = start(queue.next(context(), 1))
    queue.enqueue(intent({ eventId: 'event-2', intentId: 'intent-2' }), context(), 2)
    expect(queue.next(context({ modelId: 'model-instance-2' }), 3)).toEqual({ kind: 'cancel', modelId: 'model-instance-1', leaseId: lease.leaseId, reason: 'model-changed' })
    expect(queue.pendingCount).toBe(0)
    expect(queue.enqueue(intent({ modelId: 'model-instance-2' }), context({ modelId: 'model-instance-2' }), 4)).toBe('invalid')
  })

  it('makes disposal terminal and revokes an active lease once', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), context(), 0)
    const lease = start(queue.next(context(), 1))
    expect(queue.dispose().kind).toBe('cancel')
    expect(queue.dispose().kind).toBe('wait')
    expect(queue.owns(lease.leaseId)).toBe(false)
    expect(queue.enqueue(intent(), context(), 2)).toBe('invalid')
    expect(queue.next(context(), 3).kind).toBe('wait')
  })

  it('bounds pending groups and deduplication without evicting live IDs', () => {
    const queue = new NotificationWaveQueue('model-instance-1', { maxPending: 1, maxSeen: 2 })
    expect(queue.enqueue(intent(), context(), 0)).toBe('queued')
    expect(queue.enqueue(intent({ eventId: 'event-2', intentId: 'intent-2' }), context(), 1)).toBe('full')
    expect(queue.enqueue(intent({ eventId: 'event-3', intentId: 'intent-3' }), context(), 2)).toBe('full')
    expect(queue.enqueue(intent(), context(), 3)).toBe('duplicate')
    expect(queue.pendingCount).toBe(1)
  })

  it('bounds members of a coalesced burst', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    for (let i = 0; i < 32; i++) {
      expect(queue.enqueue(intent({ eventId: `event-${i}`, intentId: `intent-${i}`, coalesceKey: 'burst' }), context(), 0)).toBe(i === 0 ? 'queued' : 'coalesced')
    }
    expect(queue.enqueue(intent({ eventId: 'overflow', intentId: 'overflow', coalesceKey: 'burst' }), context(), 0)).toBe('full')
    expect(start(queue.next(context(), 1)).eventIds).toHaveLength(32)
  })

  it('releases matching leases only and observes the cooldown', () => {
    const queue = new NotificationWaveQueue('model-instance-1', { cooldownMs: 1000 })
    queue.enqueue(intent(), context(), 0)
    const lease = start(queue.next(context(), 1))
    queue.enqueue(intent({ eventId: 'event-2', intentId: 'intent-2' }), context(), 2)
    expect(queue.finish('other-model', lease.leaseId, 100)).toBe(false)
    expect(queue.finish('model-instance-1', 'stale-lease', 101)).toBe(false)
    expect(queue.finish('model-instance-1', lease.leaseId, 200)).toBe(true)
    expect(queue.next(context(), 1199).kind).toBe('wait')
    const next = start(queue.next(context(), 1200))
    expect(next.leaseId).not.toBe(lease.leaseId)
    expect(queue.finish('model-instance-1', lease.leaseId, 1201)).toBe(false)
    expect(queue.owns(next.leaseId)).toBe(true)
  })

  it('has a finite watchdog if playback never reports completion', () => {
    const queue = new NotificationWaveQueue('model-instance-1', { waveDurationMs: 1000 })
    queue.enqueue(intent(), context(), 0)
    const lease = start(queue.next(context(), 1))
    expect(lease.duration).toBe(1)
    expect(queue.next(context(), 1000).kind).toBe('wait')
    expect(queue.next(context(), 1001)).toEqual({ kind: 'cancel', modelId: 'model-instance-1', leaseId: lease.leaseId, reason: 'expired' })
  })

  it('rejects malformed, future, and reversed timestamps', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    expect(queue.enqueue(intent({ eventId: '' }), context(), 0)).toBe('invalid')
    expect(queue.enqueue(intent({ createdAt: 10 }), context(), 0)).toBe('invalid')
    expect(queue.enqueue(intent({ expiresAt: Infinity }), context(), 0)).toBe('invalid')
    expect(queue.enqueue(intent(), context(), Number.NaN)).toBe('invalid')
    expect(queue.enqueue(intent(), context(), 100)).toBe('queued')
    expect(queue.next(context(), 99).kind).toBe('wait')
    expect(queue.pendingCount).toBe(1)
  })

  it('caps oversized source lifetimes', () => {
    const queue = new NotificationWaveQueue('model-instance-1', { maxLifetimeMs: 1000 })
    expect(queue.enqueue(intent({ expiresAt: 1e9 }), context(), 0)).toBe('queued')
    expect(queue.next(context(), 1000).kind).toBe('wait')
    expect(queue.pendingCount).toBe(0)
  })
})

describe('conversation preemption and attention withdrawal', () => {
  const conversation = context({ conversationMotionActive: true, snapshot: snapshot({ activeId: 'bow' }) })

  it('grants conversation preemption only with explicit ownership and a real start decision', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    expect(notificationMotionOwner(conversation)).toBe('conversation')
    expect(notificationMotionOwner(context({ snapshot: snapshot({ activeId: 'bow' }) }))).toBe('busy')
    expect(queue.next(conversation, 0).kind).toBe('wait')
    queue.enqueue(intent(), conversation, 1)
    expect(start(queue.next(conversation, 2)).motionId).toBe('wave')
  })

  it('keeps manipulation, game, and user ownership above conversation preemption', () => {
    expect(notificationMotionOwner({ ...conversation, manipulationActive: true })).toBe('manual')
    expect(notificationMotionOwner({ ...conversation, gameActive: true })).toBe('game')
    expect(notificationMotionOwner({ ...conversation, userMotionActive: true })).toBe('user')
    expect(notificationMotionOwner({ ...conversation, doNotDisturb: true })).toBe('suppressed')
    expect(notificationMotionOwner({ ...conversation, snapshot: undefined })).toBe('unknown')
  })

  it('does not grant preemption for expired pending attention', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), context({ gameActive: true }), 0)
    expect(queue.pendingCount).toBe(1)
    expect(queue.next(conversation, 5000).kind).toBe('wait')
    expect(queue.pendingCount).toBe(0)
  })

  it('does not grant preemption for attention suppressed by DND', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent(), conversation, 0)
    expect(queue.next({ ...conversation, doNotDisturb: true }, 1).kind).toBe('wait')
    expect(queue.pendingCount).toBe(0)
    expect(queue.next(conversation, 2).kind).toBe('wait')
  })

  it('does not grant preemption before the notification cooldown ends', () => {
    const queue = new NotificationWaveQueue('model-instance-1', { cooldownMs: 1000 })
    queue.enqueue(intent(), context(), 0)
    const first = start(queue.next(context(), 1))
    expect(queue.finish('model-instance-1', first.leaseId, 100)).toBe(true)
    queue.enqueue(intent({ eventId: 'event-2', intentId: 'intent-2' }), conversation, 101)
    expect(queue.next(conversation, 1099).kind).toBe('wait')
    expect(start(queue.next(conversation, 1100)).eventIds).toEqual(['event-2'])
  })

  it('withdraws one coalesced pending group and preserves other groups', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent({ coalesceKey: 'read-item' }), context(), 0)
    queue.enqueue(intent({ eventId: 'event-2', intentId: 'intent-2', coalesceKey: 'read-item' }), context(), 0)
    queue.enqueue(intent({ eventId: 'event-3', intentId: 'intent-3', coalesceKey: 'unread-item' }), context(), 0)
    expect(queue.withdraw('read-item')).toBe(1)
    expect(queue.withdraw('read-item')).toBe(0)
    expect(queue.pendingCount).toBe(1)
    expect(start(queue.next(context(), 1)).eventIds).toEqual(['event-3'])
  })

  it('preserves replay protection for withdrawn event and delivery IDs', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent({ coalesceKey: 'read-item' }), context(), 0)
    expect(queue.withdraw('read-item')).toBe(1)
    expect(queue.enqueue(intent({ intentId: 'new-delivery', coalesceKey: 'read-item' }), context(), 1)).toBe('duplicate')
    expect(queue.enqueue(intent({ eventId: 'new-event', coalesceKey: 'read-item' }), context(), 1)).toBe('duplicate')
    expect(queue.next(conversation, 2).kind).toBe('wait')
  })

  it('leaves an active lease intact while withdrawing a later group with the same key', () => {
    const queue = new NotificationWaveQueue('model-instance-1')
    queue.enqueue(intent({ coalesceKey: 'read-item' }), context(), 0)
    const active = start(queue.next(context(), 1))
    expect(queue.withdraw('read-item')).toBe(0)
    expect(queue.owns(active.leaseId)).toBe(true)
    queue.enqueue(intent({ eventId: 'event-2', intentId: 'intent-2', coalesceKey: 'read-item' }), context(), 2)
    expect(queue.withdraw('read-item')).toBe(1)
    expect(queue.owns(active.leaseId)).toBe(true)
    expect(queue.pendingCount).toBe(0)
    expect(queue.next(context({ snapshot: snapshot({ activeId: 'wave' }) }), 3).kind).toBe('wait')
    expect(queue.finish('model-instance-1', active.leaseId, 100)).toBe(true)
  })
})
