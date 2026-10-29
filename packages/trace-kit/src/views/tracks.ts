import type { TracePresetDefinition } from '../core/definitions'
import type { TimelineTrack } from '../projections/types'

import { matchTrackPath } from '../core/define'

/**
 * A stable color for a track path without a defined color.
 *
 * @example
 * hashColor('plugin:minecraft/bots/b_2/planner')
 * // => 'hsl(295 60% 55%)'
 */
export function hashColor(text: string): string {
  let hash = 0
  for (const char of text)
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  // Red hues mean failure in the tracer, so the hue stays between 25 and 324 degrees.
  return `hsl(${25 + (Math.abs(hash) % 300)} 60% 55%)`
}

/** Whether a track matches a preset. A preset without tracks shows every track. */
export function presetMatches(preset: TracePresetDefinition | undefined, path: string): boolean {
  if (!preset || preset.tracks.length === 0)
    return true
  return preset.tracks.some(pattern => matchTrackPath(pattern, path) !== undefined)
}

/**
 * What a track holds, for its label: the count of its items, and how many of its spans failed. An item is a span, or
 * an instant or a state change on a track without spans.
 *
 * @example
 * trackSummary(asrTrack)
 * // => { items: 2, failed: 1 }
 */
export function trackSummary(track: TimelineTrack): { items: number, failed: number } {
  const items = track.spans.length || track.instants.length || track.states.length
  const failed = track.spans.reduce((count, span) => count + (span.status === 'error' ? 1 : 0), 0)
  return { items, failed }
}
