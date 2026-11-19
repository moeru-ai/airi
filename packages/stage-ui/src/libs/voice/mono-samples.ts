import type { AudioWindow } from '@proj-airi/pipelines-audio'

/**
 * Mixes the channels of a window into new mono PCM with finite samples in [-1, 1].
 *
 * The Sherpaw keyword spotter and speaker tracker accept only this PCM. Both throw a `RangeError` for any other sample.
 * Loud sound near the microphone can give samples slightly above 1. A device or a resampler can give NaN or Infinity.
 */
export function toMonoSamples(window: Pick<AudioWindow, 'channels'>) {
  const length = window.channels[0]?.length ?? 0
  const samples = new Float32Array(length)
  for (const channel of window.channels) {
    for (let index = 0; index < length; index++)
      samples[index] += (channel[index] ?? 0) / window.channels.length
  }
  for (let index = 0; index < length; index++) {
    const value = samples[index]
    samples[index] = Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0
  }

  return samples
}
