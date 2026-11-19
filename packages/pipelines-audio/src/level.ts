import type { AudioInput } from './audio-input'
import type { Observer } from './observe'

import { observe } from './observe'

/** One level per window gives a 20 Hz meter, which is smooth enough for a volume halo. */
const LEVEL_WINDOW_MS = 50
/** The meter shows signal from -60 dBFS (level 0) to full scale (level 1). Quieter input reads as silence. */
const LEVEL_FLOOR_DB = -60

/**
 * Publishes the level of an input until `signal` aborts, one value for each 50 ms window.
 *
 * The input can be a microphone or the output of a playback, see `Playback.output`. The observation subscribes to
 * `input`, so it keeps the source open. Run it only while the level is needed.
 * Each level is the root mean square of all channels in one window, mapped linearly in decibels to the range 0 to 1.
 */
export function observeLevel(input: AudioInput, signal: AbortSignal, onLevel: (level: number) => void): Observer {
  return observe(input, { windowMs: LEVEL_WINDOW_MS, hopMs: LEVEL_WINDOW_MS, signal }, async window => levelOf(window.channels), result => onLevel(result.value))
}

/**
 * The level of some audio: the root mean square of all channels, mapped linearly in decibels from -60 dBFS (0) to full
 * scale (1).
 *
 * @example
 * levelOf([new Float32Array([0.5, -0.5])])
 * // => 0.9 (-6 dBFS)
 */
export function levelOf(channels: readonly Float32Array[]): number {
  let sum = 0
  let count = 0
  for (const channel of channels) {
    for (const sample of channel)
      sum += sample * sample
    count += channel.length
  }
  if (!count || !sum)
    return 0
  const decibels = 10 * Math.log10(sum / count)
  return Math.min(1, Math.max(0, (decibels - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB))
}
