/**
 * One way to change a clip before it is decoded again.
 *
 * The Monte Carlo probe decodes many perturbed copies of the same clip. Spans where the copies disagree
 * are spans where the recognizer is unsure. {@link toSourceSeconds} maps each copy's token times back to
 * the clock of the original clip, so hypotheses compare by audio time and not by text position.
 */
export interface Perturbation {
  /** White noise level relative to the speech level of the clip, in dB. `Infinity` adds no noise. */
  readonly snrDb: number
  /** Silence inserted before the clip, in milliseconds. It moves the chunk boundaries of streaming models. */
  readonly shiftMs: number
  /** Playback rate. `1.05` makes the clip 5% shorter and raises its pitch by the same ratio. */
  readonly speed: number
  /** Seeds the noise generator, so the same perturbation always produces the same samples. */
  readonly seed: number
}

/** Ranges that {@link samplePerturbations} draws from. Each value is uniform between its bounds. */
export interface PerturbationRanges {
  readonly snrDb: readonly [number, number]
  readonly shiftMs: readonly [number, number]
  readonly speed: readonly [number, number]
}

/** The unchanged clip. Its decode is the reference transcript that the probe annotates. */
export const cleanPerturbation: Perturbation = Object.freeze({ snrDb: Number.POSITIVE_INFINITY, shiftMs: 0, speed: 1, seed: 0 })

/**
 * Small deterministic PRNG. Results must repeat for the same seed, so a run can be compared after
 * a threshold change, and `Math.random` cannot be seeded.
 */
export function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Draws `count` perturbations. The same seed and ranges always give the same list. */
export function samplePerturbations(count: number, ranges: PerturbationRanges, seed: number): Perturbation[] {
  const random = mulberry32(seed)
  const between = ([min, max]: readonly [number, number]) => min + (max - min) * random()
  return Array.from({ length: count }, () => ({
    snrDb: between(ranges.snrDb),
    shiftMs: between(ranges.shiftMs),
    speed: between(ranges.speed),
    seed: Math.floor(random() * 2 ** 32),
  }))
}

/**
 * Speech level of a clip as RMS amplitude.
 *
 * Only 20 ms frames louder than the median frame count. Leading and trailing silence would
 * otherwise lower the level, and the same SNR would add less noise to a clip with long pauses.
 */
function speechRms(samples: Float32Array, sampleRate: number): number {
  const frameLength = Math.max(1, Math.round(sampleRate * 0.02))
  const powers: number[] = []
  for (let start = 0; start < samples.length; start += frameLength) {
    const end = Math.min(samples.length, start + frameLength)
    let sum = 0
    for (let index = start; index < end; index++)
      sum += samples[index] * samples[index]
    powers.push(sum / (end - start))
  }
  if (powers.length === 0)
    return 0

  const median = powers.toSorted((a, b) => a - b)[Math.floor(powers.length / 2)]
  const loud = powers.filter(power => power >= median)
  return Math.sqrt(loud.reduce((total, power) => total + power, 0) / loud.length)
}

/**
 * Applies a perturbation in this order: speed, then shift, then noise.
 *
 * Noise is added last, so the inserted silence also receives noise and does not mark the shift
 * with a clean edge. The input clip is not changed.
 */
export function perturbAudio(samples: Float32Array, sampleRate: number, perturbation: Perturbation): Float32Array<ArrayBuffer> {
  // Linear interpolation is enough here. The goal is a slightly different input, not a clean resample.
  const resampledLength = Math.floor(samples.length / perturbation.speed)
  const shiftLength = Math.round(sampleRate * perturbation.shiftMs / 1000)
  const output = new Float32Array(shiftLength + resampledLength)
  for (let index = 0; index < resampledLength; index++) {
    const position = index * perturbation.speed
    const left = Math.floor(position)
    const right = Math.min(samples.length - 1, left + 1)
    const fraction = position - left
    output[shiftLength + index] = samples[left] * (1 - fraction) + samples[right] * fraction
  }

  if (!Number.isFinite(perturbation.snrDb))
    return output

  addWhiteNoise(output, speechRms(samples, sampleRate) / 10 ** (perturbation.snrDb / 20), mulberry32(perturbation.seed))
  return output
}

/** Adds Gaussian white noise with RMS amplitude `rms` to `output` in place. `random` gives uniform values in [0, 1). */
export function addWhiteNoise(output: Float32Array, rms: number, random: () => number): void {
  for (let index = 0; index < output.length; index += 2) {
    // Box-Muller gives two independent Gaussian values for each pair of uniform values.
    const radius = Math.sqrt(-2 * Math.log(1 - random())) * rms
    const angle = 2 * Math.PI * random()
    output[index] += radius * Math.cos(angle)
    if (index + 1 < output.length)
      output[index + 1] += radius * Math.sin(angle)
  }
}

/**
 * Maps a time in a perturbed copy back to the original clip.
 *
 * @example
 * toSourceSeconds(1.03, { snrDb: 20, shiftMs: 30, speed: 1.1, seed: 1 })
 * // => 1.1
 */
export function toSourceSeconds(seconds: number, perturbation: Perturbation): number {
  return Math.max(0, (seconds - perturbation.shiftMs / 1000) * perturbation.speed)
}
