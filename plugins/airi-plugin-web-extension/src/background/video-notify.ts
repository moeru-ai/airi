/** Fields of a video report that decide a character notification. */
export interface VideoNotifyReport {
  url: string
  title?: string
  videoId?: string
}

/**
 * Removes page decorations from a video title, so that the page title and the player title compare as equal.
 * For example, `(3) Song - YouTube` becomes `Song`.
 */
export function normalizeVideoTitle(title: string) {
  return title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s+-\s+YouTube$/i, '')
    .trim()
}

/**
 * Creates the gate that decides whether a video report starts a new character notification.
 *
 * YouTube changes the URL before it changes the page title. A report can carry
 * the new video id with the old title. So a video notifies only once, by id,
 * after its title differs from the last notified title and arrives twice.
 */
export function createVideoNotifyGate() {
  let lastNotifiedVideoKey = ''
  let lastNotifiedVideoTitle = ''
  const pendingVideoTitles = new Map<string, string>()

  function shouldNotify(report: VideoNotifyReport) {
    const key = report.videoId || report.url
    const title = normalizeVideoTitle(report.title ?? '')
    if (!key || !title || key === lastNotifiedVideoKey)
      return false

    // A new video id with the exact previous title is a stale report.
    if (title === lastNotifiedVideoTitle)
      return false

    // Track each video separately. Reports from other tabs must not reset the wait.
    if (pendingVideoTitles.get(key) !== title) {
      pendingVideoTitles.set(key, title)
      if (pendingVideoTitles.size > 20)
        pendingVideoTitles.delete(pendingVideoTitles.keys().next().value!)
      return false
    }

    pendingVideoTitles.delete(key)
    lastNotifiedVideoKey = key
    lastNotifiedVideoTitle = title
    return true
  }

  return { shouldNotify }
}
