import type { InjectionKey } from 'vue'

/**
 * How the layers of a release area show.
 *
 * - `static`: every layer shows at once. Vishot captures this state.
 * - `play`: every layer enters at its own time, so a screen recorder can record the area as a video.
 */
export type ReleaseTimelineMode = 'play' | 'static'

export const releaseTimelineKey: InjectionKey<ReleaseTimelineMode> = Symbol('release-timeline')

/** The entry times of the copy layers, in milliseconds. Visual layers start after them. */
export const copyTimeline = {
  eyebrow: 0,
  title: 120,
  lead: 260,
  points: 380,
  pointStep: 90,
  visuals: 700,
} as const
