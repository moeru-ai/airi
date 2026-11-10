import type { VideoNavigation } from '../shared/types'

/** What the content script reads from a YouTube page to tell the navigation phase. */
export interface YouTubePageState {
  url: string
  /** The `video-id` attribute of `ytd-watch-flexy`, the watch page that holds the title heading and the channel. */
  watchVideoId?: string | null
  /** Whether `yt-page-data-updated` came after the last `yt-navigate-start`. */
  pageDataUpdated: boolean
}

// NOTICE:
// Measured by hand in Zen (Firefox) in November 2026, with `yt-navigate-start` at 0:
// - Watch page: the URL changes at once. `yt-navigate-finish` comes after about 1.5 s, still with the old heading.
//   The page title changes with `yt-page-data-updated` at about 1.9 s.
//   The title heading, the channel and the `video-id` of `ytd-watch-flexy` change together at about 2.6 s.
// - Shorts: the watch page keeps the previous video (it plays in the mini player).
//   The page title changes with `yt-page-data-updated`, after 0.1 to 1.9 s.
// Check these rules again if YouTube changes its page structure.
/**
 * Tells whether the title source of a YouTube page belongs to the video in the URL.
 *
 * - Watch page: ready when `ytd-watch-flexy` shows the video id of the URL.
 * - Shorts page: ready after `yt-page-data-updated`, because the Short takes its title from the page title.
 *
 * @returns `undefined` when the page is not a video page.
 */
export function getYouTubeNavigation(state: YouTubePageState): VideoNavigation | undefined {
  let parsed: URL
  try {
    parsed = new URL(state.url)
  }
  catch {
    return undefined
  }

  const shortsId = parsed.pathname.match(/^\/shorts\/([^/]+)/)?.[1]
  if (shortsId)
    return { id: shortsId, phase: state.pageDataUpdated ? 'ready' : 'changing' }

  const watchId = parsed.pathname === '/watch' ? parsed.searchParams.get('v') : null
  if (watchId)
    return { id: watchId, phase: state.watchVideoId === watchId ? 'ready' : 'changing' }

  return undefined
}
