import type { DesktopCompanionState, DesktopNotificationInput, DesktopReactionIntent } from '../../../shared/desktop-companion'
import type { NativeNotificationDelivery } from './desktop-notifications'

import { NotificationWaveQueue } from '@proj-airi/stage-ui-three/companion'
import { describe, expect, it, vi } from 'vitest'

import { defaultDesktopCompanionState } from '../../../shared/desktop-companion'
import { DesktopNotificationCenter } from './desktop-notifications'

function fixture(initial = defaultDesktopCompanionState()) {
  let saved: DesktopCompanionState = structuredClone(initial)
  let now = 100_000
  const callbacks: Array<Parameters<NativeNotificationDelivery['show']>[1]> = []
  const close = vi.fn()
  const delivery = {
    supported: vi.fn(() => true),
    show: vi.fn<NativeNotificationDelivery['show']>((_input, callback) => {
      callbacks.push(callback)
      return close
    }),
  }
  const storage = {
    load: vi.fn(() => structuredClone(saved)),
    save: vi.fn((state: DesktopCompanionState) => { saved = structuredClone(state) }),
  }
  const center = new DesktopNotificationCenter(storage, delivery, () => now)
  return { center, storage, delivery, callbacks, close, advance: (ms: number) => now += ms, restart: () => new DesktopNotificationCenter(storage, delivery, () => now) }
}

function notification(overrides: Partial<DesktopNotificationInput> = {}): DesktopNotificationInput {
  return { id: 'event-1', source: 'assistant', body: 'Private reply text', priority: 'normal', ...overrides }
}

describe('desktop notification center', () => {
  it('persists before delivery and redacts previews by default', () => {
    const { center, storage, delivery } = fixture()
    center.publish(notification())
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(storage.save.mock.invocationCallOrder[0]).toBeLessThan(delivery.show.mock.invocationCallOrder[0])
    expect(center.snapshot().unreadCount).toBe(1)
    expect(center.snapshot().notifications[0].body).toBe('')
    expect(delivery.show).toHaveBeenCalledWith({ body: '', priority: 'normal' }, expect.any(Function))
    expect(JSON.stringify(storage.save.mock.calls)).not.toContain('Private reply text')
  })

  it('retains unread history when native notifications are unavailable', () => {
    const { center, delivery } = fixture()
    delivery.supported.mockReturnValue(false)
    center.publish(notification())
    expect(delivery.show).not.toHaveBeenCalled()
    expect(center.snapshot().notifications[0].nativeState).toBe('unavailable')
    expect(center.snapshot().unreadCount).toBe(1)
  })

  it('retains unread history after synchronous and asynchronous native failures', () => {
    const first = fixture()
    first.delivery.show.mockImplementation(() => {
      throw new Error('No daemon')
    })
    first.center.publish(notification())
    expect(first.center.snapshot().notifications[0].nativeState).toBe('failed')
    expect(first.center.snapshot().unreadCount).toBe(1)
    const second = fixture()
    second.center.publish(notification())
    second.callbacks[0]('failed')
    expect(second.center.snapshot().notifications[0].nativeState).toBe('failed')
    expect(second.center.snapshot().unreadCount).toBe(1)
  })

  it('does not equate show, close, or timeout with a read acknowledgment', () => {
    const { center, callbacks } = fixture()
    center.publish(notification())
    callbacks[0]('shown')
    expect(center.snapshot().notifications[0].nativeState).toBe('shown')
    callbacks[0]('closed')
    expect(center.snapshot().unreadCount).toBe(1)
  })

  it('marks a clicked event read and invokes its explicit destination once', () => {
    const { center, callbacks } = fixture()
    const onClick = vi.fn()
    center.publish(notification(), onClick)
    callbacks[0]('click')
    callbacks[0]('click')
    expect(center.snapshot().unreadCount).toBe(0)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('deduplicates retries before and after a process restart', () => {
    const { center, delivery, restart } = fixture()
    center.publish(notification())
    center.publish(notification())
    const restored = restart()
    restored.publish(notification())
    expect(restored.snapshot().unreadCount).toBe(1)
    expect(delivery.show).toHaveBeenCalledTimes(1)
    expect(restored.snapshot().notifications[0].nativeState).toBe('failed')
  })

  it('coalesces unread events by source and key without repeating banners or reactions', () => {
    const { center, delivery, advance } = fixture()
    const reaction = vi.fn()
    center.onReaction(reaction)
    center.publish(notification({ coalesceKey: 'thread', priority: 'high' }))
    advance(15_000)
    center.publish(notification({ id: 'event-2', coalesceKey: 'thread', priority: 'high' }))
    expect(center.snapshot().unreadCount).toBe(1)
    expect(center.snapshot().notifications[0].occurrences).toBe(2)
    expect(delivery.show).toHaveBeenCalledTimes(1)
    expect(reaction).toHaveBeenCalledTimes(1)
  })

  it('starts a new group after read acknowledgment or the coalescing interval', () => {
    const { center, advance } = fixture()
    center.publish(notification({ coalesceKey: 'thread' }))
    center.markRead('event-1')
    center.publish(notification({ id: 'event-2', coalesceKey: 'thread' }))
    advance(30_000)
    center.publish(notification({ id: 'event-3', coalesceKey: 'thread' }))
    expect(center.snapshot().notifications).toHaveLength(3)
    expect(center.snapshot().unreadCount).toBe(2)
  })

  it('rate-limits native banners independently from unread count', () => {
    const { center, delivery, advance } = fixture()
    center.publish(notification())
    center.publish(notification({ id: 'event-2' }))
    expect(center.snapshot().unreadCount).toBe(2)
    expect(delivery.show).toHaveBeenCalledTimes(1)
    advance(10_000)
    center.publish(notification({ id: 'event-3' }))
    expect(delivery.show).toHaveBeenCalledTimes(2)
  })

  it('dND suppresses native banners and reactions without replay when disabled', () => {
    const { center, delivery } = fixture()
    const reaction = vi.fn()
    center.onReaction(reaction)
    center.updatePreferences({ doNotDisturb: true })
    center.publish(notification({ priority: 'high' }))
    center.updatePreferences({ doNotDisturb: false })
    expect(center.snapshot().unreadCount).toBe(1)
    expect(delivery.show).not.toHaveBeenCalled()
    expect(reaction).not.toHaveBeenCalled()
  })

  it('stops active banners when DND is enabled and leaves them unread', () => {
    const { center, close } = fixture()
    center.publish(notification())
    center.updatePreferences({ doNotDisturb: true })
    expect(close).toHaveBeenCalledTimes(1)
    expect(center.snapshot().unreadCount).toBe(1)
  })

  it('stores previews only when enabled and scrubs existing previews when disabled', () => {
    const { center, close, restart } = fixture()
    center.updatePreferences({ notificationPreviews: true })
    center.publish(notification())
    expect(center.snapshot().notifications[0].body).toBe('Private reply text')
    center.updatePreferences({ notificationPreviews: false })
    expect(center.snapshot().notifications[0].body).toBe('')
    expect(restart().snapshot().notifications[0].body).toBe('')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('persists border and DND settings across restart with partial updates', () => {
    const { center, restart } = fixture()
    center.updatePreferences({ pulsingBorder: false })
    center.updatePreferences({ doNotDisturb: true })
    expect(restart().snapshot().preferences.pulsingBorder).toBe(false)
    expect(restart().snapshot().preferences.doNotDisturb).toBe(true)
  })

  it('marks individual and all groups read, then clears history without replay', () => {
    const { center, restart, callbacks, delivery } = fixture()
    center.publish(notification())
    center.publish(notification({ id: 'event-2' }))
    center.markRead('event-1')
    expect(center.snapshot().unreadCount).toBe(1)
    center.markRead()
    expect(restart().snapshot().unreadCount).toBe(0)
    center.clear()
    callbacks[0]('shown')
    expect(restart().snapshot().notifications).toHaveLength(0)
    center.publish(notification())
    expect(center.snapshot().notifications).toHaveLength(0)
    expect(delivery.show).toHaveBeenCalledTimes(1)
  })

  it('ignores late native callbacks after clear or disposal', () => {
    const { center, callbacks, storage } = fixture()
    const onClick = vi.fn()
    center.publish(notification(), onClick)
    center.clear()
    const writes = storage.save.mock.calls.length
    callbacks[0]('click')
    callbacks[0]('shown')
    expect(onClick).not.toHaveBeenCalled()
    expect(storage.save).toHaveBeenCalledTimes(writes)
    expect(center.snapshot().unreadCount).toBe(0)
  })

  it('closes an active banner when a burst evicts its unread record', () => {
    const { center, callbacks, close, delivery, restart } = fixture()
    const onClick = vi.fn()
    center.publish(notification(), onClick)
    for (let index = 2; index <= 101; index++)
      center.publish(notification({ id: `event-${index}` }))
    expect(delivery.show).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
    expect(center.snapshot().notifications.some(item => item.id === 'event-1')).toBe(false)
    expect(center.snapshot().archivedUnreadCount).toBe(1)
    expect(center.snapshot().unreadCount).toBe(101)
    callbacks[0]('click')
    expect(onClick).not.toHaveBeenCalled()
    expect(center.snapshot().unreadCount).toBe(101)
    center.markRead()
    expect(restart().snapshot().unreadCount).toBe(0)
  })

  it('keeps private banners open across unrelated preference edits', () => {
    const { center, close, callbacks } = fixture()
    center.publish(notification())
    center.updatePreferences({ pulsingBorder: false })
    center.updatePreferences({ priorityReactions: false })
    center.updatePreferences({ notificationPreviews: false })
    expect(close).not.toHaveBeenCalled()
    callbacks[0]('click')
    expect(center.snapshot().unreadCount).toBe(0)
  })

  it('caps history, deduplication state, and native resources', () => {
    const { center, storage, delivery, close, advance } = fixture()
    for (let index = 0; index < 205; index++) {
      center.publish(notification({ id: `event-${index}` }))
      advance(10_000)
    }
    expect(center.snapshot().notifications).toHaveLength(100)
    expect(center.snapshot().unreadCount).toBe(205)
    expect(center.snapshot().archivedUnreadCount).toBe(105)
    expect(storage.load().recentEventIds).toHaveLength(200)
    expect(delivery.show).toHaveBeenCalledTimes(205)
    expect(close).toHaveBeenCalledTimes(200)
    center.dispose()
    expect(close).toHaveBeenCalledTimes(205)
  })

  it('emits only fresh high-priority intents, with a separate cooldown', () => {
    const { center, advance, restart } = fixture()
    const reaction = vi.fn()
    center.onReaction(reaction)
    center.publish(notification())
    center.publish(notification({ id: 'high-1', priority: 'high' }))
    center.publish(notification({ id: 'high-2', priority: 'high' }))
    expect(reaction).toHaveBeenCalledTimes(1)
    expect(reaction.mock.calls[0][0]).toMatchObject({ motion: 'wave', expiresAt: 105_000 })
    advance(30_000)
    center.publish(notification({ id: 'high-3', priority: 'high' }))
    expect(reaction).toHaveBeenCalledTimes(2)
    const restoredReaction = vi.fn()
    restart().onReaction(restoredReaction)
    expect(restoredReaction).not.toHaveBeenCalled()
  })

  it('keeps maximum-length event IDs valid at the motion queue boundary', () => {
    const { center } = fixture()
    const reaction = vi.fn<(intent: DesktopReactionIntent) => void>()
    center.onReaction(reaction)
    const id = 'event'.padEnd(160, 'x')
    center.publish(notification({ id, priority: 'high' }))
    const intent = reaction.mock.calls[0]![0]
    expect(intent.requestId).toBe(id)
    const queue = new NotificationWaveQueue('loaded')
    expect(queue.enqueue({
      modelId: 'loaded',
      eventId: intent.requestId,
      intentId: intent.requestId,
      coalesceKey: intent.notificationId,
      createdAt: intent.createdAt,
      expiresAt: intent.expiresAt,
    }, {
      modelId: 'loaded',
      snapshot: { activeId: 'idle', idleId: 'idle', loadingId: undefined, queuedIds: [], cachedClipCount: 0, error: undefined },
      manipulationActive: false,
      gameActive: false,
      userMotionActive: false,
      paused: false,
      doNotDisturb: false,
      reducedMotion: false,
      enabled: true,
      waveAvailable: true,
    }, intent.createdAt)).toBe('queued')
    queue.dispose()
    center.dispose()
  })

  it('rejects invalid requests before storage or native delivery', () => {
    const { center, storage, delivery } = fixture()
    expect(() => center.publish(notification({ body: 'a'.repeat(4001) }))).toThrow()
    expect(() => center.publish(notification({ id: '' }))).toThrow()
    expect(storage.save).not.toHaveBeenCalled()
    expect(delivery.show).not.toHaveBeenCalled()
  })

  it('keeps state unchanged after a write failure and permits a safe retry', () => {
    const { center, storage, delivery } = fixture()
    storage.save.mockImplementationOnce(() => {
      throw new Error('Disk full')
    })
    expect(() => center.publish(notification())).toThrow('Failed to save')
    expect(center.snapshot().unreadCount).toBe(0)
    expect(center.snapshot().persistence).toBe('error')
    expect(delivery.show).not.toHaveBeenCalled()
    center.publish(notification())
    expect(center.snapshot().unreadCount).toBe(1)
    expect(center.snapshot().persistence).toBe('ready')
  })

  it('does not overwrite unreadable storage or let a closed renderer break delivery', () => {
    const bad = new DesktopNotificationCenter({ load: () => {
      throw new Error('Invalid JSON')
    }, save: vi.fn() }, { supported: () => true, show: vi.fn() })
    expect(bad.snapshot().persistence).toBe('error')
    expect(() => bad.clear()).toThrow('storage is unavailable')
    const { center, delivery } = fixture()
    center.subscribe(() => {
      throw new Error('Window closed')
    })
    expect(() => center.publish(notification())).not.toThrow()
    expect(delivery.show).toHaveBeenCalledTimes(1)
  })
})
