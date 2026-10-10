import type { DesktopCompanionSnapshot, DesktopReactionIntent } from '../../shared/desktop-companion'

import { describe, expect, it } from 'vitest'

import { defaultDesktopPreferences } from '../../shared/desktop-companion'
import { desktopWaveIntent } from './desktop-wave-intent'

const intent: DesktopReactionIntent = { notificationId: 'group', requestId: 'source', motion: 'wave', priority: 'high', createdAt: 100, expiresAt: 5100 }
function snapshot(read = false): DesktopCompanionSnapshot {
  return {
    preferences: defaultDesktopPreferences(),
    notifications: [{ id: 'group', source: 'assistant', priority: 'high', body: '', createdAt: 100, updatedAt: 100, occurrences: 1, read, nativeState: 'shown' }],
    unreadCount: read ? 0 : 1,
    archivedUnreadCount: 0,
    nativeSupported: true,
    persistence: 'ready',
    revision: 1,
  }
}

describe('live desktop wave adapter', () => {
  it('preserves source identity and expiry for a currently unread group', () => {
    expect(desktopWaveIntent(intent, snapshot())).toEqual({ eventId: 'source', intentId: 'source', coalesceKey: 'group', createdAt: 100, expiresAt: 5100 })
  })
  it('rejects a delayed intent after the group was read', () => {
    expect(desktopWaveIntent(intent, snapshot(true))).toBeUndefined()
  })
  it('rejects a delayed intent after clear or eviction', () => {
    const cleared = snapshot()
    cleared.notifications = []
    expect(desktopWaveIntent(intent, cleared)).toBeUndefined()
  })
  it('keeps unread attention independent of unavailable native delivery', () => {
    const unavailable = snapshot()
    unavailable.nativeSupported = false
    unavailable.notifications[0].nativeState = 'unavailable'
    expect(desktopWaveIntent(intent, unavailable)).toBeDefined()
  })
})
