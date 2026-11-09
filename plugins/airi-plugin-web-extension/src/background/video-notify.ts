/** Fields of a video report that decide a character notification. */
export interface VideoNotifyReport {
  url: string
  title?: string
  videoId?: string
}

// NOTICE:
// YouTube changes the URL about 1 to 2 seconds before the title heading. Early reports carry the old title.
// Source: `findVideoTitle` in `src/content/index.ts`. The delay was measured by hand on YouTube.
// Remove it when the title source changes together with the video id.
/** How long a video title must stay the same before the gate notifies. */
const SETTLE_MS = 3_000

// NOTICE:
// A slow page can keep the old title heading longer than `SETTLE_MS`.
// So a new video with the last notified title waits longer. If the title stays, the video has the same name.
// Remove this window together with `SETTLE_MS`.
/** How long a new video must keep the title of the last notified video before the gate notifies. */
const STALE_TITLE_WINDOW_MS = 10_000

/** How many notified videos the gate remembers, so that two playing tabs do not notify each other in turns. */
const NOTIFIED_VIDEO_LIMIT = 50

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
 * YouTube changes the URL before it changes the page title. A report can carry
 * the new video id with the old title. So the gate waits until the title of a
 * video stays the same for {@link SETTLE_MS}. A title that equals the last
 * notified title of the same tab waits {@link STALE_TITLE_WINDOW_MS}. Then the gate calls
 * `onSettle` once with the latest report of that video.
 *
 * The content script sends a report only when the payload changes. So the gate
 * uses its own timer and does not wait for a second report.
 *
 * State lives in memory for the life of the background page:
 * - `notifiedVideoKeys` holds recently notified videos. A notified video does not notify again.
 * - `lastNotifiedTitles` holds the last notified title of each tab, to detect stale reports.
 *   A stale title comes from the previous video of the same tab, so other tabs do not affect it.
 * - `pendingVideos` holds each waiting video with its title, latest report, and timer.
 *
 * Call `forgetTab` when a tab closes. Call `dispose` to stop all timers.
 */
export class VideoNotifyGate<T extends VideoNotifyReport> {
  private readonly notifiedVideoKeys = new Set<string>()
  private readonly lastNotifiedTitles = new Map<number, string>()
  private readonly pendingVideos = new Map<string, { title: string, report: T, tabId?: number, timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly onSettle: (report: T) => void) {}

  report(next: T, tabId?: number) {
    const key = next.videoId || next.url
    const title = normalizeVideoTitle(next.title ?? '')
    if (!key || !title || this.notifiedVideoKeys.has(key))
      return

    const pending = this.pendingVideos.get(key)
    // The title did not change. Keep the timer, and send the latest report when it settles.
    if (pending?.title === title) {
      pending.report = next
      return
    }

    if (pending)
      clearTimeout(pending.timer)

    const lastTitle = tabId == null ? undefined : this.lastNotifiedTitles.get(tabId)
    const delay = title === lastTitle ? STALE_TITLE_WINDOW_MS : SETTLE_MS
    this.pendingVideos.set(key, { title, report: next, tabId, timer: setTimeout(() => this.settle(key), delay) })

    if (this.pendingVideos.size > PENDING_VIDEO_LIMIT) {
      const [oldestKey, oldest] = this.pendingVideos.entries().next().value!
      clearTimeout(oldest.timer)
      this.pendingVideos.delete(oldestKey)
    }
  }

  forgetTab(tabId: number) {
    this.lastNotifiedTitles.delete(tabId)
  }

  dispose() {
    for (const pending of this.pendingVideos.values())
      clearTimeout(pending.timer)
    this.pendingVideos.clear()
  }

  private settle(key: string) {
    const pending = this.pendingVideos.get(key)
    if (!pending)
      return

    this.pendingVideos.delete(key)
    this.notifiedVideoKeys.add(key)
    if (this.notifiedVideoKeys.size > NOTIFIED_VIDEO_LIMIT)
      this.notifiedVideoKeys.delete(this.notifiedVideoKeys.values().next().value!)

    if (pending.tabId != null)
      this.lastNotifiedTitles.set(pending.tabId, pending.title)
    this.onSettle(pending.report)
  }
}
