/** Fields of a video report that decide a character notification. */
export interface VideoNotifyReport {
  url: string
  title?: string
  videoId?: string
}

/**
 * How long a video title must stay the same before the gate notifies.
 * YouTube updates the title about 1 to 2 seconds after the URL.
 */
const SETTLE_MS = 3_000

/**
 * How long a new video must keep the title of the last notified video before the gate notifies.
 * At first such a title is a stale report. If it stays, the new video has the same name.
 */
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
 * Creates the gate that decides when a video starts a character notification.
 *
 * YouTube changes the URL before it changes the page title. A report can carry
 * the new video id with the old title. So the gate waits until the title of a
 * video stays the same for {@link SETTLE_MS}. A title that equals the last
 * notified title waits {@link STALE_TITLE_WINDOW_MS}. Then the gate calls
 * `onSettle` once with the latest report of that video.
 *
 * The content script sends a report only when the payload changes. So the gate
 * uses its own timer and does not wait for a second report.
 *
 * State lives in memory for the life of the background page:
 * - `notifiedVideoKeys` holds recently notified videos. A notified video does not notify again.
 * - `lastNotifiedVideoTitle` holds the title of the last notified video, to detect stale reports.
 * - `pendingVideos` holds each waiting video with its title, latest report, and timer.
 *
 * Call `dispose` to stop all timers.
 */
export function createVideoNotifyGate<T extends VideoNotifyReport>(onSettle: (report: T) => void) {
  const notifiedVideoKeys = new Set<string>()
  let lastNotifiedVideoTitle = ''
  const pendingVideos = new Map<string, { title: string, report: T, timer: ReturnType<typeof setTimeout> }>()

  function settle(key: string) {
    const pending = pendingVideos.get(key)
    if (!pending)
      return

    pendingVideos.delete(key)
    notifiedVideoKeys.add(key)
    if (notifiedVideoKeys.size > NOTIFIED_VIDEO_LIMIT)
      notifiedVideoKeys.delete(notifiedVideoKeys.values().next().value!)

    lastNotifiedVideoTitle = pending.title
    onSettle(pending.report)
  }

  function report(next: T) {
    const key = next.videoId || next.url
    const title = normalizeVideoTitle(next.title ?? '')
    if (!key || !title || notifiedVideoKeys.has(key))
      return

    const pending = pendingVideos.get(key)
    // The title did not change. Keep the timer, and send the latest report when it settles.
    if (pending?.title === title) {
      pending.report = next
      return
    }

    if (pending)
      clearTimeout(pending.timer)

    const delay = title === lastNotifiedVideoTitle ? STALE_TITLE_WINDOW_MS : SETTLE_MS
    pendingVideos.set(key, { title, report: next, timer: setTimeout(settle, delay, key) })

    if (pendingVideos.size > PENDING_VIDEO_LIMIT) {
      const [oldestKey, oldest] = pendingVideos.entries().next().value!
      clearTimeout(oldest.timer)
      pendingVideos.delete(oldestKey)
    }
  }

  function dispose() {
    for (const pending of pendingVideos.values())
      clearTimeout(pending.timer)
    pendingVideos.clear()
  }

  return { report, dispose }
}
