import type { InferOutput } from 'valibot'

import { array, boolean, finite, integer, maxLength, maxValue, minLength, minValue, number, object, optional, picklist, pipe, string } from 'valibot'

const identifier = pipe(string(), minLength(1), maxLength(160))
const timestamp = pipe(number(), finite(), minValue(0))
const count = pipe(number(), integer(), minValue(1), maxValue(1_000_000))

export const desktopPreferencesSchema = object({
  pulsingBorder: boolean(),
  nativeNotifications: boolean(),
  notificationPreviews: boolean(),
  doNotDisturb: boolean(),
  priorityReactions: boolean(),
})
export type DesktopPreferences = InferOutput<typeof desktopPreferencesSchema>

export function defaultDesktopPreferences(): DesktopPreferences {
  return {
    pulsingBorder: true,
    nativeNotifications: true,
    notificationPreviews: false,
    doNotDisturb: false,
    priorityReactions: true,
  }
}

export const desktopNotificationInputSchema = object({
  id: identifier,
  source: picklist(['spotlight', 'assistant', 'system', 'test']),
  body: pipe(string(), maxLength(4000)),
  priority: picklist(['normal', 'high']),
  coalesceKey: optional(identifier),
})
export type DesktopNotificationInput = InferOutput<typeof desktopNotificationInputSchema>

export const desktopNotificationRecordSchema = object({
  id: identifier,
  source: picklist(['spotlight', 'assistant', 'system', 'test']),
  body: pipe(string(), maxLength(4000)),
  priority: picklist(['normal', 'high']),
  coalesceKey: optional(identifier),
  createdAt: timestamp,
  updatedAt: timestamp,
  occurrences: count,
  read: boolean(),
  nativeState: picklist(['pending', 'shown', 'suppressed', 'unavailable', 'failed']),
})
export type DesktopNotificationRecord = InferOutput<typeof desktopNotificationRecordSchema>

/** Main owns this bounded history. The unread count counts groups, including coalesced events. */
export const desktopCompanionStateSchema = object({
  preferences: desktopPreferencesSchema,
  notifications: pipe(array(desktopNotificationRecordSchema), maxLength(100)),
  recentEventIds: pipe(array(identifier), maxLength(200)),
  archivedUnreadCount: pipe(number(), integer(), minValue(0), maxValue(1_000_000)),
  lastNativeAt: timestamp,
  lastReactionAt: timestamp,
  revision: pipe(number(), integer(), minValue(0)),
})
export type DesktopCompanionState = InferOutput<typeof desktopCompanionStateSchema>

export function defaultDesktopCompanionState(): DesktopCompanionState {
  return {
    preferences: defaultDesktopPreferences(),
    notifications: [],
    recentEventIds: [],
    archivedUnreadCount: 0,
    lastNativeAt: 0,
    lastReactionAt: 0,
    revision: 0,
  }
}

/** Snapshots omit event deduplication keys and never claim that the user saw an OS banner. */
export interface DesktopCompanionSnapshot {
  preferences: DesktopPreferences
  notifications: DesktopNotificationRecord[]
  unreadCount: number
  archivedUnreadCount: number
  nativeSupported: boolean
  persistence: 'ready' | 'error'
  revision: number
}

/** Short-lived intent for the main stage only. Renderers must not replay it after reconnect or restart. */
export interface DesktopReactionIntent {
  notificationId: string
  requestId: string
  priority: 'high'
  motion: 'wave'
  createdAt: number
  expiresAt: number
}

/** Electron screen points and content bounds share DIP coordinates. localCss also accounts for page zoom. */
export interface DesktopCursorSample {
  screenDip: { x: number, y: number }
  localCss: { x: number, y: number }
  displayId: number
  sampledAt: number
  layoutRevision: number
}

export interface DesktopCapabilities {
  layoutRevision: number
  backend: 'wayland' | 'xwayland' | 'x11' | 'macos' | 'windows' | 'unknown'
  detection: 'explicit' | 'session' | 'platform'
  globalCursor: 'available' | 'unsupported' | 'unknown'
  windowPositioning: 'available' | 'unsupported' | 'unknown'
  cursorSource: 'electron-screen' | 'window-local'
  nativeNotifications: boolean
  displays: Array<{
    id: number
    bounds: { x: number, y: number, width: number, height: number }
    workArea: { x: number, y: number, width: number, height: number }
    scaleFactor: number
  }>
}
