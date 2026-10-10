import type {
  DesktopCompanionSnapshot,
  DesktopCompanionState,
  DesktopNotificationInput,
  DesktopNotificationRecord,
  DesktopPreferences,
  DesktopReactionIntent,
} from '../../../shared/desktop-companion'

import { parse, partial } from 'valibot'

import { defaultDesktopCompanionState, desktopCompanionStateSchema, desktopNotificationInputSchema, desktopPreferencesSchema } from '../../../shared/desktop-companion'

/** Storage writes finish before an event is acknowledged or a native banner is sent. */
export interface DesktopNotificationStorage {
  load: () => DesktopCompanionState
  save: (state: DesktopCompanionState) => void
}

/** Electron is the only native delivery boundary. A show event does not establish user visibility. */
export interface NativeNotificationDelivery {
  supported: () => boolean
  show: (input: { body: string, priority: 'normal' | 'high' }, onEvent: (event: 'shown' | 'click' | 'closed' | 'failed') => void) => () => void
}

/**
 * Owns persisted settings, bounded unread groups, deduplication, and native notification lifetimes.
 * New events never replay after restart. DND keeps unread history without banners or reaction intents.
 */
export class DesktopNotificationCenter {
  private state: DesktopCompanionState
  private loadFailed = false
  private persistence: DesktopCompanionSnapshot['persistence'] = 'ready'
  private readonly listeners = new Set<(snapshot: DesktopCompanionSnapshot) => void>()
  private readonly reactions = new Set<(intent: DesktopReactionIntent) => void>()
  private readonly active = new Map<string, () => void>()

  constructor(
    private readonly storage: DesktopNotificationStorage,
    private readonly delivery: NativeNotificationDelivery,
    private readonly now: () => number = Date.now,
  ) {
    try {
      this.state = parse(desktopCompanionStateSchema, storage.load())
      // Native notifications belong to the previous process. Never infer their delivery on restart.
      this.state.notifications = this.state.notifications.map(item => item.nativeState === 'pending' ? { ...item, nativeState: 'failed' } : item)
    }
    catch {
      this.state = defaultDesktopCompanionState()
      this.persistence = 'error'
      this.loadFailed = true
    }
  }

  snapshot(): DesktopCompanionSnapshot {
    return {
      preferences: { ...this.state.preferences },
      notifications: this.state.notifications.map(item => ({ ...item })),
      unreadCount: this.state.archivedUnreadCount + this.state.notifications.filter(item => !item.read).length,
      archivedUnreadCount: this.state.archivedUnreadCount,
      nativeSupported: this.delivery.supported(),
      persistence: this.persistence,
      revision: this.state.revision,
    }
  }

  subscribe(listener: (snapshot: DesktopCompanionSnapshot) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onReaction(listener: (intent: DesktopReactionIntent) => void) {
    this.reactions.add(listener)
    return () => this.reactions.delete(listener)
  }

  private commit(next: DesktopCompanionState) {
    if (this.loadFailed)
      throw new Error('Desktop notification storage is unavailable')
    next.revision = this.state.revision + 1
    try {
      this.storage.save(next)
    }
    catch {
      this.persistence = 'error'
      this.broadcast()
      throw new Error('Failed to save desktop notification state')
    }
    this.state = next
    this.persistence = 'ready'
    this.broadcast()
  }

  private broadcast() {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      }
      catch {
        // A closed renderer cannot prevent persistence or delivery to other windows.
        this.listeners.delete(listener)
      }
    }
  }

  updatePreferences(preferences: Partial<DesktopPreferences>) {
    const previous = this.state.preferences
    const parsed = { ...previous, ...parse(partial(desktopPreferencesSchema), preferences) }
    const previewsDisabled = previous.notificationPreviews && !parsed.notificationPreviews
    const notifications = this.state.notifications.map(item => parsed.notificationPreviews ? { ...item } : { ...item, body: '' })
    this.commit({ ...this.state, preferences: parsed, notifications })
    if (parsed.doNotDisturb || !parsed.nativeNotifications || previewsDisabled)
      this.closeActive()
    return this.snapshot()
  }

  publish(input: DesktopNotificationInput, onClick?: () => void) {
    const event = parse(desktopNotificationInputSchema, input)
    if (this.state.recentEventIds.includes(event.id))
      return this.snapshot()

    const now = this.now()
    const { preferences } = this.state
    const group = event.coalesceKey
      ? this.state.notifications.find(item => !item.read && item.source === event.source && item.coalesceKey === event.coalesceKey && now >= item.updatedAt && now - item.updatedAt < 30_000)
      : undefined
    const eligible = !preferences.doNotDisturb && preferences.nativeNotifications && !group
    const rateLimited = this.state.lastNativeAt > 0 && now >= this.state.lastNativeAt && now - this.state.lastNativeAt < 10_000
    let nativeState: DesktopNotificationRecord['nativeState'] = 'suppressed'
    if (eligible && !rateLimited)
      nativeState = this.delivery.supported() ? 'pending' : 'unavailable'

    const record: DesktopNotificationRecord = {
      ...event,
      id: group?.id ?? event.id,
      body: preferences.notificationPreviews ? event.body : '',
      priority: group?.priority === 'high' ? 'high' : event.priority,
      createdAt: group?.createdAt ?? now,
      updatedAt: now,
      occurrences: Math.min(1_000_000, (group?.occurrences ?? 0) + 1),
      read: false,
      nativeState: group?.nativeState ?? nativeState,
    }
    const reaction = event.priority === 'high' && preferences.priorityReactions && !preferences.doNotDisturb && !group
      && (this.state.lastReactionAt === 0 || now < this.state.lastReactionAt || now - this.state.lastReactionAt >= 30_000)
    const notifications = [record, ...this.state.notifications.filter(item => item.id !== record.id)]
    const evicted = notifications.slice(100)
    const archivedUnreadCount = Math.min(1_000_000, this.state.archivedUnreadCount + evicted.filter(item => !item.read).length)
    this.commit({
      ...this.state,
      notifications: notifications.slice(0, 100),
      archivedUnreadCount,
      recentEventIds: [...this.state.recentEventIds, event.id].slice(-200),
      lastNativeAt: nativeState === 'pending' ? now : this.state.lastNativeAt,
      lastReactionAt: reaction ? now : this.state.lastReactionAt,
    })

    // An archived count has no per-record acknowledgment. Close its banner once the new history is durable.
    for (const item of evicted)
      this.closeActive(item.id)

    if (nativeState === 'pending' && !group) {
      try {
        // Keep native resources bounded even when a notification server omits close events.
        if (this.active.size >= 5) {
          const oldest = this.active.keys().next().value
          if (oldest)
            this.closeActive(oldest)
        }
        let finished = false
        const close = this.delivery.show({ body: record.body, priority: record.priority }, (result) => {
          if (finished)
            return
          if (result === 'closed' || result === 'click' || result === 'failed') {
            finished = true
            this.active.delete(record.id)
          }
          try {
            if (result === 'click') {
              this.markRead(record.id)
              onClick?.()
            }
            else if (result === 'shown' || result === 'failed') {
              this.updateNativeState(record.id, result)
            }
          }
          catch {
            // Persistence failures remain visible in the snapshot. The OS callback cannot reject the original IPC request.
          }
        })
        if (!finished) {
          this.active.set(record.id, () => {
            finished = true
            close()
          })
        }
      }
      catch {
        this.updateNativeState(record.id, 'failed')
      }
    }

    if (reaction) {
      const intent: DesktopReactionIntent = {
        notificationId: record.id,
        requestId: event.id,
        priority: 'high',
        motion: 'wave',
        createdAt: now,
        expiresAt: now + 5000,
      }
      for (const listener of this.reactions) {
        try {
          listener(intent)
        }
        catch {
          this.reactions.delete(listener)
        }
      }
    }
    return this.snapshot()
  }

  private updateNativeState(id: string, nativeState: 'shown' | 'failed') {
    if (!this.state.notifications.some(item => item.id === id))
      return
    this.commit({ ...this.state, notifications: this.state.notifications.map(item => item.id === id ? { ...item, nativeState } : item) })
  }

  markRead(id?: string) {
    this.commit({ ...this.state, archivedUnreadCount: id ? this.state.archivedUnreadCount : 0, notifications: this.state.notifications.map(item => !id || item.id === id ? { ...item, read: true } : item) })
    this.closeActive(id)
    return this.snapshot()
  }

  clear() {
    // Keep deduplication keys and rate limits. Clearing history does not authorize replay from a producer.
    this.commit({ ...this.state, archivedUnreadCount: 0, notifications: [] })
    this.closeActive()
    return this.snapshot()
  }

  private closeActive(id?: string) {
    for (const [key, close] of this.active) {
      if (id && key !== id)
        continue
      this.active.delete(key)
      try {
        close()
      }
      catch {
        // Closing a banner cannot restore read or cleared history.
      }
    }
  }

  dispose() {
    this.closeActive()
    this.listeners.clear()
    this.reactions.clear()
  }
}
