/** The fields of a video element that decide which video the user watches. */
export type VideoCandidate = Pick<HTMLVideoElement, 'paused' | 'getBoundingClientRect'>

/**
 * Picks the video that the user watches from all video elements of the page.
 *
 * A page can have several videos. For example, YouTube moves the previous video to a paused
 * mini player when the user opens Shorts, and it keeps hidden players for the next Shorts.
 * The first video of the page is then not the one that the user watches.
 *
 * A playing video wins. Among the rest, the largest visible video wins. A video without size is hidden and never wins.
 */
export function pickVideo<T extends VideoCandidate>(videos: Iterable<T>): T | undefined {
  let best: T | undefined
  let bestPlaying = false
  let bestArea = 0

  for (const video of videos) {
    const rect = video.getBoundingClientRect()
    const area = rect.width * rect.height
    if (area <= 0)
      continue

    const playing = !video.paused
    if (!best || (playing && !bestPlaying) || (playing === bestPlaying && area > bestArea)) {
      best = video
      bestPlaying = playing
      bestArea = area
    }
  }

  return best
}
