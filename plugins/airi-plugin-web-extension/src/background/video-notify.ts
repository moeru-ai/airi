import type { VideoNavigation } from '../shared/types'

/** Fields of a video report that decide a character notification. */
export interface VideoNotifyReport {
  url: string
  title?: string
  videoId?: string
  navigation?: VideoNavigation
}

/**
 * How long the user must stay on a ready video before the gate notifies.
 * Without it, a Short that the user scrolls past in half a second would start a reaction.
 */
const DWELL_MS = 3_000

// NOTICE:
// Used only for reports without `navigation`, for example on Bilibili.
// Such a site does not tell when the title belongs to the new video, so the gate guesses from time.
// Remove it when every site reports `navigation`.
/** How long a video title must stay the same before the gate notifies a report without `navigation`. */
const SETTLE_MS = 3_000

// NOTICE:
// A slow page can keep the old title heading longer than `SETTLE_MS`.
// So a new video with the last settled title waits longer. If the title stays, the video has the same name.
// Used only for reports without `navigation`. Remove this window together with `SETTLE_MS`.
/** How long a new video must keep the title of the last settled video before the gate notifies. */
const STALE_TITLE_WINDOW_MS = 10_000

/** How many notified videos the gate remembers, so that two playing tabs do not notify each other in turns. */
const NOTIFIED_VIDEO_LIMIT = 50

/**
 * The shortest time between two notifications. A video that settles sooner is skipped, not queued.
 * A skipped video can notify when the user comes back to it after the cooldown.
 * Short videos, for example YouTube Shorts, settle every few seconds while the user scrolls.
 * A queued reaction would then be about a video that the user left long ago.
 */
const NOTIFY_COOLDOWN_MS = 30_000

/** How many waiting videos the gate keeps. Videos that never settle do not grow the map past this limit. */
const PENDING_VIDEO_LIMIT = 20

/**
 * Normalizes a video title, so that the page title and the player title of one video compare as equal.
 *
 * @example
 * normalizeVideoTitle('(3) Song - YouTube')
 * // => 'Song'
 */
function normalizeVideoTitle(title: string) {
  return title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s+-\s+YouTube$/i, '')
    .trim()
}

/**
 * Decides when a video starts a character notification.
 *
 * A video context update records every report. A notification is the curated subset:
 * a video that the user really watches, once.
 *
 * A report with `navigation` tells whether its title belongs to the video in the URL.
 * - `changing`: the gate waits and does not notify.
 * - `ready`: the video settles after the user stays on it for {@link DWELL_MS}.
 *
 * A report without `navigation` comes from a site that does not tell this, for example Bilibili.
 * A report can then carry the new video id with the old title. So the gate waits until the title
 * of a video stays the same for {@link SETTLE_MS}. A title that equals the last settled title of the
 * same tab waits {@link STALE_TITLE_WINDOW_MS}. Then the video settles.
 *
 * The gate calls `onSettle` once with the latest report of a settled video, unless the last
 * notification was less than {@link NOTIFY_COOLDOWN_MS} ago. Then the video is skipped.
 *
 * The content script sends a report only when the payload changes. So the gate
 * uses its own timer and does not wait for a second report.
 *
 * State lives in memory for the life of the background page:
 * - `notifiedVideoKeys` holds recently notified videos. A notified video does not notify again.
 * - `lastSettledTitles` holds the last settled title of each tab, to detect stale reports.
 *   A stale title comes from the previous video of the same tab, so other tabs do not affect it.
 * - `pendingVideos` holds each waiting video with its title, latest report, tab, timer,
 *   and whether it waits for a ready video (`dwell`) or for a title to settle.
 *   Each tab has at most one waiting video. A new video of the tab replaces it.
 * - `lastNotifiedAt` holds the time of the last notification, for the cooldown.
 *
 * Call `forgetTab` when a tab closes, so that its waiting videos do not notify. Call `dispose` to stop all timers.
 */
export class VideoNotifyGate<T extends VideoNotifyReport> {
  private readonly notifiedVideoKeys = new Set<string>()
  private readonly lastSettledTitles = new Map<number, string>()
  private readonly pendingVideos = new Map<string, { title: string, report: T, tabId?: number, dwell: boolean, timer: ReturnType<typeof setTimeout> }>()
  private lastNotifiedAt = Number.NEGATIVE_INFINITY

  constructor(private readonly onSettle: (report: T) => void) {}

  report(next: T, tabId?: number) {
    const key = next.videoId || next.url
    const title = normalizeVideoTitle(next.title ?? '')
    if (!key || !title)
      return

    // The tab shows this video now, even when the video cannot notify again.
    // So clean up the tab first, and check for a notified video after it.
    this.forgetOtherVideosOfTab(key, tabId)
    if (this.notifiedVideoKeys.has(key))
      return

    if (next.navigation) {
      this.reportNavigation(key, title, next, next.navigation, tabId)
      return
    }

    const pending = this.pendingVideos.get(key)
    // The title did not change. Keep the timer, and send the latest report when it settles.
    if (pending?.title === title) {
      pending.report = next
      return
    }

    const lastTitle = tabId == null ? undefined : this.lastSettledTitles.get(tabId)
    const delay = title === lastTitle ? STALE_TITLE_WINDOW_MS : SETTLE_MS
    this.wait(key, title, next, tabId, false, delay)
  }

  forgetTab(tabId: number) {
    this.lastSettledTitles.delete(tabId)

    for (const [key, pending] of this.pendingVideos) {
      if (pending.tabId === tabId) {
        clearTimeout(pending.timer)
        this.pendingVideos.delete(key)
      }
    }
  }

  dispose() {
    for (const pending of this.pendingVideos.values())
      clearTimeout(pending.timer)
    this.pendingVideos.clear()
  }

  private reportNavigation(key: string, title: string, next: T, navigation: VideoNavigation, tabId?: number) {
    const pending = this.pendingVideos.get(key)

    if (navigation.phase === 'changing') {
      // The title can still belong to the previous video. Nothing waits for this video yet.
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingVideos.delete(key)
      }
      return
    }

    // The video is ready and the user still stays on it. Keep the timer, and send the latest report.
    if (pending?.dwell) {
      pending.title = title
      pending.report = next
      return
    }

    this.wait(key, title, next, tabId, true, DWELL_MS)
  }

  /** Starts to wait for a video. It replaces an earlier wait for the same video. */
  private wait(key: string, title: string, next: T, tabId: number | undefined, dwell: boolean, delay: number) {
    const pending = this.pendingVideos.get(key)
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingVideos.delete(key)
    }

    this.pendingVideos.set(key, { title, report: next, tabId, dwell, timer: setTimeout(() => this.settle(key), delay) })

    if (this.pendingVideos.size > PENDING_VIDEO_LIMIT) {
      const [oldestKey, oldest] = this.pendingVideos.entries().next().value!
      clearTimeout(oldest.timer)
      this.pendingVideos.delete(oldestKey)
    }
  }

  /**
   * A tab shows one video at a time. When the user moves on, for example by scrolling Shorts,
   * the video that the tab showed before must not settle and notify after the user left it.
   */
  private forgetOtherVideosOfTab(key: string, tabId?: number) {
    if (tabId == null)
      return

    for (const [otherKey, other] of this.pendingVideos) {
      if (other.tabId === tabId && otherKey !== key) {
        clearTimeout(other.timer)
        this.pendingVideos.delete(otherKey)
        return
      }
    }
  }

  private settle(key: string) {
    const pending = this.pendingVideos.get(key)
    if (!pending)
      return

    this.pendingVideos.delete(key)

    // A skipped video is still the previous video of its tab. So it updates the stale title check too.
    if (pending.tabId != null)
      this.lastSettledTitles.set(pending.tabId, pending.title)

    const now = Date.now()
    if (now - this.lastNotifiedAt < NOTIFY_COOLDOWN_MS)
      return

    this.notifiedVideoKeys.add(key)
    if (this.notifiedVideoKeys.size > NOTIFIED_VIDEO_LIMIT)
      this.notifiedVideoKeys.delete(this.notifiedVideoKeys.values().next().value!)

    this.lastNotifiedAt = now
    this.onSettle(pending.report)
  }
}
