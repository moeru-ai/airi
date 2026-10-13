import type { Hypothesis } from './analysis'
import type { DecoderPool } from './decoder-pool'
import type { Perturbation, PerturbationRanges } from './perturbation'

import { analyzeHypotheses, defaultAnalysisOptions, normalizeToken, toHypothesis } from './analysis'
import { cleanPerturbation, perturbAudio, samplePerturbations } from './perturbation'

/** Settings of one probe run on one clip. */
export interface ProbeSettings {
  readonly sampleRate: number
  /** Perturbed decodes when the early stop does not apply. */
  readonly count: number
  readonly ranges: PerturbationRanges
  readonly seed: number
  /** Blank penalty of the extra decode that exposes deleted speech. `0` skips that decode. */
  readonly blankPenalty: number
  /**
   * Perturbed decodes that run first. The others run only when one of these hears other words than the
   * reference, or a word at another time. A value of `count` or more, or `0`, turns the early stop off.
   */
  readonly firstCount: number
}

export interface ProbeSample {
  readonly perturbation: Perturbation
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
 * Decodes one clip clean and with perturbations, and returns every hypothesis on the clip's clock.
 *
 * The reference is a decode of the same clip, not the live transcript. A live decoder carries context
 * from earlier speech, and that difference would look like instability.
 *
 * All decodes go to the pool at once, so they run in parallel up to the pool size. With the early stop,
 * the first decodes run alone. Most clear speech decodes the same way every time, so the others are
 * skipped. The skipped decodes cannot change agreement for such a clip, but a span that only a few
 * decodes reveal can be missed.
 */
export async function probeClip(pool: Pick<DecoderPool, 'decode'>, clip: Float32Array, settings: ProbeSettings, options: ProbeOptions = {}): Promise<ProbeResult> {
  const { sampleRate, blankPenalty } = settings
  const perturbations = samplePerturbations(settings.count, settings.ranges, settings.seed)
  const earlyStop = settings.firstCount > 0 && settings.firstCount < perturbations.length
  const first = earlyStop ? perturbations.slice(0, settings.firstCount) : perturbations

  let done = 0
  let total = 1 + first.length + (blankPenalty > 0 ? 1 : 0)
  options.onProgress?.(done, total)
  const decode = async (perturbation: Perturbation, penalty: number) => {
    const segments = await pool.decode(perturbAudio(clip, sampleRate, perturbation), { sampleRate, blankPenalty: penalty }, options.signal)
    options.onProgress?.(++done, total)
    return toHypothesis(segments, perturbation)
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
