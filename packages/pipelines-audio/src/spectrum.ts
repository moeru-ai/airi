import type { AudioInput } from './audio-input'
import type { Observer } from './observe'

import FFT from 'fft.js'

import { observe } from './observe'

/** A frequency range, in hertz. */
export interface SpectrumBand {
  readonly fromHz: number
  readonly toHz: number
}

/** Four bands across the voice range: the fundamental, the low and the high formants, and the sibilants. */
export const voiceBands: readonly SpectrumBand[] = [
  { fromHz: 80, toHz: 300 },
  { fromHz: 300, toHz: 1000 },
  { fromHz: 1000, toHz: 3000 },
  { fromHz: 3000, toHz: 8000 },
]

/** About 30 updates a second, for a visual that follows the voice. Each update moves the audio forward by one hop. */
const SPECTRUM_WINDOW_MS = 40
export const SPECTRUM_HOP_MS = 33
/**
 * The published power of a band is the mean of this many windows (the Welch method). The power of one window of noise
 * varies about as much as its mean, so a visual of single windows flickers. A mean of 2 cuts that variation by about
 * a third, and adds only about 33 ms of delay, so the visual stays lively.
 */
const AVERAGED_WINDOWS = 2
/** Band levels map this range of decibels to 0 and 1. A band of a quiet room reads near 0, and loud speech near 1. */
const BAND_FLOOR_DB = -80
const BAND_CEILING_DB = -20

/** One transform for each size. A window always has the same size for one sample rate. */
const transforms = new Map<number, FFT>()

function transformOf(size: number) {
  let transform = transforms.get(size)
  if (!transform) {
    transform = new FFT(size)
    transforms.set(size, transform)
  }
  return transform
}

/**
 * The mean power of each band in some audio, relative to a sine of full scale.
 *
 * The channels are mixed to one, shaped with a Hann window, and zero-padded to a power of two.
 */
export function bandPowersOf(channels: readonly Float32Array[], sampleRate: number, bands: readonly SpectrumBand[] = voiceBands): number[] {
  const frames = channels[0]?.length ?? 0
  if (!frames)
    return bands.map(() => 0)

  const size = 2 ** Math.ceil(Math.log2(Math.max(2, frames)))
  const input = new Float64Array(size)
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0
    for (const channel of channels)
      sum += channel[frame] ?? 0
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * frame) / Math.max(1, frames - 1))
    input[frame] = (sum / channels.length) * hann
  }

  const transform = transformOf(size)
  const spectrum: number[] = transform.createComplexArray()
  transform.realTransform(spectrum, input)

  // A Hann window halves the amplitude on average, so the scale restores it for a sine of full scale.
  const scale = 4 / frames
  const hzPerBin = sampleRate / size
  return bands.map((band) => {
    const firstBin = Math.max(1, Math.floor(band.fromHz / hzPerBin))
    const lastBin = Math.min(size / 2 - 1, Math.ceil(band.toHz / hzPerBin))
    if (lastBin < firstBin)
      return 0
    let power = 0
    for (let bin = firstBin; bin <= lastBin; bin++) {
      const real = spectrum[bin * 2] * scale
      const imaginary = spectrum[bin * 2 + 1] * scale
      power += real * real + imaginary * imaginary
    }
    return power / (lastBin - firstBin + 1)
  })
}

/** Maps a band power linearly in decibels from -80 dB (0) to -20 dB (1). */
export function levelOfBandPower(power: number): number {
  if (!power)
    return 0
  const decibels = 10 * Math.log10(power)
  return Math.min(1, Math.max(0, (decibels - BAND_FLOOR_DB) / (BAND_CEILING_DB - BAND_FLOOR_DB)))
}

/**
 * The level of each band in some audio, from 0 to 1.
 *
 * @example
 * bandLevelsOf([sineAt150Hz], 48000, voiceBands)
 * // => [0.9, 0.1, 0, 0]
 */
export function bandLevelsOf(channels: readonly Float32Array[], sampleRate: number, bands: readonly SpectrumBand[] = voiceBands): number[] {
  return bandPowersOf(channels, sampleRate, bands).map(levelOfBandPower)
}

/**
 * Publishes the level of each band of an input until `signal` aborts, one value for each 33 ms hop.
 *
 * Each level comes from the mean power of the last 2 windows, so noise flickers less. A gap in the audio starts the
 * mean again. Like `observeLevel`, the observation subscribes to `input` and keeps the source open. Run it only while a
 * visual needs it.
 */
export function observeSpectrum(
  input: AudioInput,
  signal: AbortSignal,
  onBands: (levels: number[]) => void,
  bands: readonly SpectrumBand[] = voiceBands,
): Observer {
  let recent: number[][] = []
  return observe(
    input,
    { windowMs: SPECTRUM_WINDOW_MS, hopMs: SPECTRUM_HOP_MS, signal, scheduling: 'ordered' },
    async window => ({ powers: bandPowersOf(window.channels, window.sampleRate, bands), discontinuity: window.discontinuity }),
    (result) => {
      if (result.value.discontinuity)
        recent = []
      recent = [...recent.slice(1 - AVERAGED_WINDOWS), result.value.powers]
      onBands(bands.map((_, index) => levelOfBandPower(recent.reduce((sum, powers) => sum + powers[index], 0) / recent.length)))
    },
  )
}
