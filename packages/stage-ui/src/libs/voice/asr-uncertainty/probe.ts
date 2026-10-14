import type { Hypothesis } from './analysis'
import type { DecoderPool } from './decoder-pool'
import type { RolloutSettings } from './events'
import type { Perturbation, PerturbationRanges } from './perturbation'

import { analyzeHypotheses, defaultAnalysisOptions, normalizeToken, toHypothesis } from './analysis'
import { cleanPerturbation, perturbAudio, samplePerturbations } from './perturbation'

/**
 * Where the probe adds noise.
 *
 * - `encoder`: rollouts add noise to the encoder output of one clean decode. The encoder runs once, so a
 *   rollout costs only a decoder and joiner pass. Only transducers support it.
 * - `input`: each rollout adds noise to the audio and decodes the copy again, the encoder included.
 */
export type ProbeNoise = 'encoder' | 'input'

/** Settings of one probe run on one clip. */
export interface ProbeSettings {
  readonly sampleRate: number
  readonly noise: ProbeNoise
  /** Rollouts. For `input` noise, the perturbed decodes when the early stop does not apply. */
  readonly count: number
  /** Noise level of `encoder` rollouts, as a multiple of the standard deviation of the encoder output. */
  readonly sigma: number
  /** Perturbations of `input` rollouts. */
  readonly ranges: PerturbationRanges
  readonly seed: number
  /** Blank penalty of the extra decode that exposes deleted speech. `0` skips that decode. */
  readonly blankPenalty: number
  /**
   * `input` rollouts that run first. The others run only when one of these hears other words than the
   * reference, or a word at another time. A value of `count` or more, or `0`, turns the early stop off.
   * `encoder` rollouts all run in the reference decode, so they have no early stop.
   */
  readonly firstCount: number
}

export interface ProbeSample {
  /** The change to the audio. Undefined for an `encoder` rollout, which decodes the clean audio. */
  readonly perturbation?: Perturbation
  readonly hypothesis: Hypothesis
}

export interface ProbeResult {
  /** The decoded clip, so the result stays readable after the input changes. */
  readonly clip: Float32Array
  readonly durationSeconds: number
  readonly reference: Hypothesis
  readonly samples: readonly ProbeSample[]
  readonly probe?: Hypothesis
  /** True when the first decodes all matched the reference, so the others did not run. */
  readonly stoppedEarly: boolean
}

export interface ProbeOptions {
  readonly signal?: AbortSignal
  /** Runs after each decode, with the decodes done and the decodes planned so far. */
  readonly onProgress?: (done: number, total: number) => void
}

/** True when the hypothesis has the reference's words in the same order. Punctuation does not count. */
function sameWords(reference: Hypothesis, hypothesis: Hypothesis) {
  const words = (value: Hypothesis) => value.tokens.map(token => normalizeToken(token.text)).filter(key => key !== '')
  const expected = words(reference)
  const actual = words(hypothesis)
  return expected.length === actual.length && expected.every((key, index) => key === actual[index])
}

/**
 * True when every sample has the reference's words in the same order, each near its reference time.
 * The analysis decides "near" with its default thresholds, so a word that moves in time also counts as a change.
 */
function agreesWithReference(reference: Hypothesis, samples: readonly Hypothesis[], durationSeconds: number) {
  if (!samples.every(sample => sameWords(reference, sample)))
    return false
  const { tokens } = analyzeHypotheses(reference, samples, durationSeconds, defaultAnalysisOptions)
  return tokens.every(agreement => normalizeToken(agreement.token.text) === '' || (agreement.byTime ?? 1) === 1)
}

/**
 * Decodes one clip clean and with noise, and returns every hypothesis on the clip's clock.
 *
 * The reference is a decode of the same clip, not the live transcript. A live decoder carries context
 * from earlier speech, and that difference would look like instability.
 *
 * `encoder` noise needs one decode for the reference and all rollouts. The rest of this comment is about
 * `input` noise.
 *
 * All decodes go to the pool at once, so they run in parallel up to the pool size. With the early stop,
 * the first decodes run alone. Most clear speech decodes the same way every time, so the others are
 * skipped. The skipped decodes cannot change agreement for such a clip, but a span that only a few
 * decodes reveal can be missed.
 */
export async function probeClip(pool: Pick<DecoderPool, 'decode'>, clip: Float32Array, settings: ProbeSettings, options: ProbeOptions = {}): Promise<ProbeResult> {
  return settings.noise === 'encoder' ? probeEncoderNoise(pool, clip, settings, options) : probeInputNoise(pool, clip, settings, options)
}

async function probeEncoderNoise(pool: Pick<DecoderPool, 'decode'>, clip: Float32Array, settings: ProbeSettings, options: ProbeOptions): Promise<ProbeResult> {
  const { sampleRate, blankPenalty } = settings
  let done = 0
  const total = blankPenalty > 0 ? 2 : 1
  options.onProgress?.(done, total)
  const decode = async (penalty: number, rollouts?: RolloutSettings) => {
    const decoded = await pool.decode(clip, { sampleRate, blankPenalty: penalty, rollouts }, options.signal)
    options.onProgress?.(++done, total)
    return decoded
  }
  const [decoded, probe] = await Promise.all([
    decode(0, { count: settings.count, sigma: settings.sigma, seed: settings.seed }),
    blankPenalty > 0 ? decode(blankPenalty) : undefined,
  ])
  return {
    clip,
    durationSeconds: clip.length / sampleRate,
    reference: toHypothesis(decoded.segments, cleanPerturbation),
    samples: decoded.rollouts.map(segments => ({ hypothesis: toHypothesis(segments, cleanPerturbation) })),
    probe: probe && toHypothesis(probe.segments, cleanPerturbation),
    stoppedEarly: false,
  }
}

async function probeInputNoise(pool: Pick<DecoderPool, 'decode'>, clip: Float32Array, settings: ProbeSettings, options: ProbeOptions): Promise<ProbeResult> {
  const { sampleRate, blankPenalty } = settings
  const perturbations = samplePerturbations(settings.count, settings.ranges, settings.seed)
  const earlyStop = settings.firstCount > 0 && settings.firstCount < perturbations.length
  const first = earlyStop ? perturbations.slice(0, settings.firstCount) : perturbations

  let done = 0
  let total = 1 + first.length + (blankPenalty > 0 ? 1 : 0)
  options.onProgress?.(done, total)
  const decode = async (perturbation: Perturbation, penalty: number) => {
    const decoded = await pool.decode(perturbAudio(clip, sampleRate, perturbation), { sampleRate, blankPenalty: penalty }, options.signal)
    options.onProgress?.(++done, total)
    return toHypothesis(decoded.segments, perturbation)
  }
  const decodeSamples = (planned: readonly Perturbation[]) => Promise.all(planned.map(async perturbation => ({ perturbation, hypothesis: await decode(perturbation, 0) })))

  const [reference, firstSamples, probe] = await Promise.all([
    decode(cleanPerturbation, 0),
    decodeSamples(first),
    blankPenalty > 0 ? decode(cleanPerturbation, blankPenalty) : undefined,
  ])

  const durationSeconds = clip.length / sampleRate
  const stoppedEarly = earlyStop && agreesWithReference(reference, firstSamples.map(sample => sample.hypothesis), durationSeconds)
  let samples = firstSamples
  if (earlyStop && !stoppedEarly) {
    const rest = perturbations.slice(first.length)
    total += rest.length
    samples = [...firstSamples, ...await decodeSamples(rest)]
  }

  return { clip, durationSeconds, reference, samples, probe, stoppedEarly }
}
