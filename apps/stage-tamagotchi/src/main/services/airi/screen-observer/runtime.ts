import type {
  PauseObservationRequest,
  ScreenObserverPrivacyState,
  TouchAction,
  TouchEventMessage,
  TouchLevel,
} from '@proj-airi/server-sdk-shared'

import { isBarePercentage } from '@proj-airi/server-sdk-shared'

/**
 * Pure desktop-runtime decisions for screen observation.
 *
 * The server contract (`@proj-airi/server-sdk-shared`) owns the task model,
 * privacy-state resolution (`resolveObservationPrivacyState`), and touch
 * decisions; this module owns only what the Electron main process must decide
 * locally: whether the poller may capture right now, how long a manual pause
 * lasts, which surfaces count as meetings, and how an L3 touch renders as a
 * system notification.
 */

/** Screen capture may only run while the resolved state is plain `observing`. */
export function shouldCaptureScreen(privacyState: ScreenObserverPrivacyState): boolean {
  return privacyState === 'observing'
}

/**
 * Computes the absolute pause deadline for a pause request.
 *
 * Use when:
 * - The tray quick-pause menu, the global shortcut, or a renderer invoke asks
 *   to pause observation.
 *
 * Expects:
 * - `request.pauseUntil`, when present, is an ISO timestamp and wins over the
 *   reason-derived duration.
 *
 * Returns:
 * - The `Date` when observation should resume. `manual_today` resolves to the
 *   end of the local day so "pause for the rest of today" survives restarts.
 */
export function computePauseUntil(request: PauseObservationRequest, now: Date): Date {
  if (request.pauseUntil)
    return new Date(request.pauseUntil)

  switch (request.reason) {
    case 'manual_15m':
      return new Date(now.getTime() + 15 * 60 * 1000)
    case 'manual_1h':
      return new Date(now.getTime() + 60 * 60 * 1000)
    case 'manual_today': {
      const endOfDay = new Date(now)
      endOfDay.setHours(23, 59, 59, 999)
      return endOfDay
    }
    // Fullscreen/meeting suppression is normally auto-managed by the detector
    // each poll tick; an explicit pause request with these reasons (e.g. a
    // renderer-side signal) gets a short window and re-evaluates afterwards.
    case 'fullscreen':
    case 'meeting':
      return new Date(now.getTime() + 15 * 60 * 1000)
  }

  throw new Error(`Unsupported pause reason: ${String(request.reason)}`)
}

/**
 * Known meeting surfaces, matched case-insensitively as substrings.
 *
 * App names cover native clients; window-title keywords catch browser-based
 * meetings where the app is just a browser. Both lists are deliberately
 * conservative: a false "meeting" only mutes touches to L0, but a noisy match
 * would suppress observation for whole work sessions.
 */
const MEETING_APP_NAMES = [
  'zoom',
  'microsoft teams',
  'ms-teams',
  'webex',
  'skype',
  'voov',
  'wemeet',
  '腾讯会议',
  'dingtalk',
  '钉钉',
  'facetime',
]

const MEETING_WINDOW_TITLE_KEYWORDS = [
  'google meet',
  'zoom meeting',
  'microsoft teams',
  '视频会议',
  '腾讯会议',
  'meet.google.com',
]

/** Decides whether the currently focused app/window looks like an active meeting. */
export function isMeetingSurface(appName: string | undefined, windowTitle?: string): boolean {
  const app = appName?.toLowerCase() ?? ''
  if (app && MEETING_APP_NAMES.some(name => app.includes(name)))
    return true

  const title = windowTitle?.toLowerCase() ?? ''
  return title.length > 0 && MEETING_WINDOW_TITLE_KEYWORDS.some(keyword => title.includes(keyword))
}

export interface TouchNotificationContent {
  title: string
  body: string
}

/**
 * Renders the human-language touch message as a system notification.
 *
 * Use when:
 * - An L3 touch must be shown via the OS notification center.
 *
 * Expects:
 * - `message` follows the contract's human-language structure. The shared
 *   decide layer is the primary bare-percentage guard; this formatter
 *   re-applies the SAME shared `isBarePercentage` at the presentation
 *   boundary so a bare `75%` can never reach the notification center even
 *   when a message bypassed the decide path.
 *
 * Returns:
 * - Title carries the remaining-work sentence (or its localized fallback
 *   when the sentence is a bare percentage); body carries pace and a
 *   localized ETA line when present, prefixed with the off-track marker when
 *   the task drifted. A bare-percentage pace line is dropped, not reworded.
 */
export function formatTouchNotification(
  message: TouchEventMessage,
  t: (key: string, named: Record<string, unknown>) => string,
): TouchNotificationContent {
  const lines: string[] = []

  if (message.pace && !isBarePercentage(message.pace))
    lines.push(message.pace)

  if (message.etaAt) {
    const eta = new Date(message.etaAt)
    if (!Number.isNaN(eta.getTime())) {
      const time = `${String(eta.getHours()).padStart(2, '0')}:${String(eta.getMinutes()).padStart(2, '0')}`
      lines.push(t('tamagotchi.electron.screen_observation.notification.eta_at', { time }))
    }
  }

  if (message.isOffTrack)
    lines.unshift(t('tamagotchi.electron.screen_observation.notification.off_track', {}))

  return {
    title: isBarePercentage(message.remainingWork)
      ? t('tamagotchi.electron.screen_observation.notification.remaining_fallback', {})
      : message.remainingWork,
    body: lines.join('\n'),
  }
}

export interface TouchInteractionLedgerEntry {
  /** Level of the current consecutive-ignore streak; cleared by any engagement. */
  ignoredLevel?: TouchLevel
  /** Consecutive ignores at `ignoredLevel`; maps to `DecideTouchInput.ignoredTouchesAtSameLevel`. */
  ignoredCount: number
  /** Set when the user chose "don't remind me about this again" for the task. */
  mutedAt?: string
  /** Last time an L2+ touch was actually presented; maps to `DecideTouchInput.lastL2PlusTouchAt` for the 30-minute throttle. */
  lastL2PlusTouchAt?: string
}

export type TouchOutcome
  = | { kind: 'action', action: TouchAction }
    | { kind: 'ignored', level: TouchLevel }

export function emptyLedgerEntry(): TouchInteractionLedgerEntry {
  return { ignoredCount: 0 }
}

/**
 * Applies a user's reaction (or silence) to a task's touch-interaction ledger.
 *
 * Use when:
 * - A task-touch notice resolved with an action, or closed/timed out with
 *   none; this is the input feed for the frozen "ignored twice at the same
 *   level -> downgrade" rule.
 *
 * Expects:
 * - `outcome.kind === 'ignored'` carries the level the touch was presented
 *   at, so streaks only count ignores of the SAME level consecutively.
 *
 * Returns:
 * - A new entry: any explicit action resets the ignore streak; `mute_task`
 *   additionally stamps `mutedAt`; an ignore extends the streak when the
 *   level matches, otherwise restarts it at 1.
 */
export function applyTouchOutcome(entry: TouchInteractionLedgerEntry, outcome: TouchOutcome, now: Date): TouchInteractionLedgerEntry {
  if (outcome.kind === 'action') {
    if (outcome.action === 'mute_task')
      return { ...entry, ignoredLevel: undefined, ignoredCount: 0, mutedAt: now.toISOString() }
    // Any explicit engagement (ack / details / pause actions) breaks the streak.
    return { ...entry, ignoredLevel: undefined, ignoredCount: 0 }
  }

  const isSameLevelStreak = entry.ignoredLevel === outcome.level
  return {
    ...entry,
    ignoredLevel: outcome.level,
    ignoredCount: isSameLevelStreak ? entry.ignoredCount + 1 : 1,
  }
}

/** Stamps the L2+ throttle clock when a touch is actually presented (not for L0/L1, which show nothing). */
export function recordTouchPresented(entry: TouchInteractionLedgerEntry, level: TouchLevel, at: Date): TouchInteractionLedgerEntry {
  if (level !== 'L2' && level !== 'L3')
    return entry
  return { ...entry, lastL2PlusTouchAt: at.toISOString() }
}
