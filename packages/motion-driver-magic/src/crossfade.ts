import type { Frame, GenerateOptions, Generator } from './types'

/** Controls for one crossfade between two generators. */
export interface CrossfadeOptions {
  /** Number of generated frames that the blend takes. A value of 0 switches at once. */
  frameCount: number
}

function smoothstep(progress: number): number {
  return progress * progress * (3 - 2 * progress)
}

/**
 * Blends the frames of one generator into the frames of another generator.
 *
 * Both generators advance on each frame until the blend ends, so the outgoing
 * motion keeps moving while it fades. A smoothstep weight starts and ends the
 * blend without a jump in speed. After the blend, the result returns the frames
 * of `to` only, with its own state.
 *
 * Use when:
 * - A motion source changes its profile, for example from idle to speaking.
 *
 * Expects:
 * - Both generators have the same sample rate and the same frame width.
 */
export function crossfade<TFrom, TTo>(
  from: Generator<TFrom>,
  to: Generator<TTo>,
  options: CrossfadeOptions,
): Generator<TTo> {
  if (from.sampleRateHz !== to.sampleRateHz)
    throw new Error(`Cannot crossfade generators with different sample rates: ${from.sampleRateHz} Hz and ${to.sampleRateHz} Hz.`)

  const frameCount = Math.max(0, Math.round(options.frameCount))
  let frameIndex = 0

  function next(generateOptions?: GenerateOptions): Frame<TTo> {
    const target = to.next(generateOptions)
    if (frameIndex >= frameCount)
      return target

    frameIndex += 1
    const source = from.next(generateOptions)
    if (source.values.length !== target.values.length)
      throw new Error(`Cannot crossfade frames with different widths: ${source.values.length} and ${target.values.length}.`)

    const weight = smoothstep(frameIndex / frameCount)
    return {
      values: target.values.map((value, index) => source.values[index] + (value - source.values[index]) * weight),
      state: target.state,
    }
  }

  return {
    sampleRateHz: to.sampleRateHz,
    next,
  }
}
