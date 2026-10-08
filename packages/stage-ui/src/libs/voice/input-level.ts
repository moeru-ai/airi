import type { AudioInput, Observer } from '@proj-airi/pipelines-audio'

import { observe } from '@proj-airi/pipelines-audio'

/** One level per window gives a 20 Hz meter, which is smooth enough for a volume halo. */
const LEVEL_WINDOW_MS = 50
/** The meter shows signal from -60 dBFS (level 0) to full scale (level 1). Quieter input reads as silence. */
const LEVEL_FLOOR_DB = -60

/**
 * Publishes the microphone level until `signal` aborts.
 *
 * The observation subscribes to `input`, so it keeps the microphone open. Run it only while a control already captures audio.
 * Each level is the root mean square of all channels in one window, mapped linearly in decibels to the range 0 to 1.
 */
export function observeInputLevel(input: AudioInput, signal: AbortSignal, onLevel: (level: number) => void): Observer {
  return observe(input, { windowMs: LEVEL_WINDOW_MS, hopMs: LEVEL_WINDOW_MS, signal }, async (window) => {
    let sum = 0
    let count = 0
    for (const channel of window.channels) {
      for (const sample of channel)
        sum += sample * sample
      count += channel.length
    }
    if (!count || !sum)
      return 0
    const decibels = 10 * Math.log10(sum / count)
    return Math.min(1, Math.max(0, (decibels - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB))
  }, result => onLevel(result.value))
}
