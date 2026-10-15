import type { Hypothesis, UncertainSpan } from './analysis'

import { insertPosition, joinTokens, normalizeToken } from './analysis'

/** Smoothed loudness of a clip and the syllable nuclei found in it. */
export interface IntensityContour {
  /** Seconds between two values of `db`. */
  readonly hopSeconds: number
  /** Smoothed frame loudness in dBFS. */
  readonly db: Float32Array
  /** Frames below this level count as silence. */
  readonly silenceDb: number
  /** Times of syllable nuclei, in seconds. */
  readonly nuclei: readonly number[]
}

export interface NucleusOptions {
  /** @default 0.01 */
  readonly hopSeconds: number
  /** Moving average width that removes pitch-period ripple from the contour. @default 0.05 */
  readonly smoothingSeconds: number
  /** Frames this far below the loudest 1% of frames are silence. @default 25 */
  readonly silenceRangeDb: number
  /**
   * A peak is a new nucleus only if the contour dips at least this far below the lower of the two
   * peaks between them. An elongated vowel keeps a flat contour, so it stays one nucleus. @default 3
   */
  readonly minDipDb: number
}

export const defaultNucleusOptions: Readonly<NucleusOptions> = Object.freeze({
  hopSeconds: 0.01,
  smoothingSeconds: 0.05,
  silenceRangeDb: 25,
  minDipDb: 3,
})

/** A streaming transducer emits a token after its audio, never before, and less than this late. */
const MAX_EMISSION_DELAY_SECONDS = 1
const EMISSION_DELAY_STEP_SECONDS = 0.02
/** With fewer timed tokens or nuclei, a delay fits by chance. */
const MIN_DELAY_EVIDENCE = 3
/**
 * The cost of a token that matches no nucleus, in seconds of distance. It is about half a syllable, so a token
 * farther than this from every free nucleus stays unmatched.
 */
const UNMATCHED_TOKEN_COST_SECONDS = 0.1

/**
 * Aligns the token times to the nuclei in order, with each nucleus used at most once, and returns the total cost.
 * A matched token costs its distance to its nucleus. An unmatched token costs `UNMATCHED_TOKEN_COST_SECONDS`.
 * An unmatched nucleus costs nothing, because speech without a transcript has nuclei but no tokens.
 */
function alignmentCost(times: readonly number[], nuclei: readonly number[]) {
  // `previous[j]` is the cost of the tokens before this one with the first `j` nuclei.
  let previous: number[] = Array.from<number>({ length: nuclei.length + 1 }).fill(0)
  for (const [index, time] of times.entries()) {
    const current = [(index + 1) * UNMATCHED_TOKEN_COST_SECONDS]
    for (let j = 1; j <= nuclei.length; j++) {
      current[j] = Math.min(
        current[j - 1]!,
        previous[j]! + UNMATCHED_TOKEN_COST_SECONDS,
        previous[j - 1]! + Math.abs(time - nuclei[j - 1]!),
      )
    }
    previous = current
  }
  return previous[nuclei.length]!
}

/**
 * Estimates how long after its syllable the decoder emitted the tokens of `reference`.
 *
 * Token times are emission times. A streaming transducer emits a token only after it has heard the
 * syllable, so its token times lag the speech. X-ASR emitted about 0.4 s late in a measured Mandarin clip.
 * The estimate is the delay with the best one-to-one alignment of text tokens to nuclei in order.
 * Nearest-nucleus matching is not enough: with evenly spaced syllables, each late token is near the nucleus of a later syllable.
 * The estimate is 0 when the clip has too few timed tokens or nuclei.
 */
export function estimateEmissionDelay(contour: Pick<IntensityContour, 'nuclei'>, reference: Hypothesis): number {
  const times = reference.tokens
    .filter(token => token.time !== undefined && normalizeToken(token.text) !== '')
    .map(token => token.time!)
  if (times.length < MIN_DELAY_EVIDENCE || contour.nuclei.length < MIN_DELAY_EVIDENCE)
    return 0

  const nuclei = contour.nuclei.toSorted((a, b) => a - b)
  let best = { delay: 0, cost: Number.POSITIVE_INFINITY }
  for (let step = 0; step * EMISSION_DELAY_STEP_SECONDS <= MAX_EMISSION_DELAY_SECONDS; step++) {
    const delay = step * EMISSION_DELAY_STEP_SECONDS
    const cost = alignmentCost(times.map(time => time - delay), nuclei)
    // A later delay must fit clearly better, so a flat fit keeps the smaller delay.
    if (cost < best.cost - 1e-6)
      best = { delay, cost }
  }
  return best.delay
}

/** Moves every token time of `hypothesis` earlier by `seconds`, and not before the clip start. */
export function shiftTokenTimes(hypothesis: Hypothesis, seconds: number): Hypothesis {
  if (seconds === 0)
    return hypothesis
  return { tokens: hypothesis.tokens.map(token => token.time === undefined ? token : { ...token, time: Math.max(0, token.time - seconds) }) }
}

/**
 * Finds syllable nuclei from loudness alone, after de Jong and Wempe (2009).
 *
 * A syllable is a loudness peak with a dip before the next one. Token times say where the model heard
 * something, and nuclei say where someone said something. Nuclei with no token near them are speech
 * that the transcript does not cover.
 *
 * This version has no voicing check, so a loud fricative or a knock can also become a nucleus.
 * Source: https://doi.org/10.3758/BRM.41.2.385
 */
export function measureIntensity(samples: Float32Array, sampleRate: number, options: NucleusOptions): IntensityContour {
  const hop = Math.max(1, Math.round(sampleRate * options.hopSeconds))
  const frameCount = Math.ceil(samples.length / hop)
  const raw = new Float32Array(frameCount)
  for (let frame = 0; frame < frameCount; frame++) {
    // Each window is two hops wide and centered on its hop, so neighboring frames overlap by half.
    const start = Math.max(0, frame * hop - Math.floor(hop / 2))
    const end = Math.min(samples.length, start + 2 * hop)
    let power = 0
    for (let index = start; index < end; index++)
      power += samples[index] * samples[index]
    raw[frame] = 10 * Math.log10(power / Math.max(1, end - start) + 1e-12)
  }

  const radius = Math.max(0, Math.round(options.smoothingSeconds / options.hopSeconds / 2))
  const db = new Float32Array(frameCount)
  for (let frame = 0; frame < frameCount; frame++) {
    const start = Math.max(0, frame - radius)
    const end = Math.min(frameCount, frame + radius + 1)
    let sum = 0
    for (let index = start; index < end; index++)
      sum += raw[index]
    db[frame] = sum / (end - start)
  }

  const sorted = db.toSorted()
  const silenceDb = (sorted[Math.floor(0.99 * (sorted.length - 1))] ?? 0) - options.silenceRangeDb

  const nuclei: number[] = []
  for (let frame = 1; frame < frameCount - 1; frame++) {
    // `>=` on the left and `>` on the right takes the first frame of a flat top as the peak.
    if (db[frame] <= silenceDb || db[frame] < db[frame - 1] || db[frame] <= db[frame + 1])
      continue
    const last = nuclei.at(-1)
    if (last === undefined) {
      nuclei.push(frame)
      continue
    }
    let dip = Number.POSITIVE_INFINITY
    for (let index = last; index <= frame; index++)
      dip = Math.min(dip, db[index])
    if (Math.min(db[last], db[frame]) - dip >= options.minDipDb)
      nuclei.push(frame)
    else if (db[frame] > db[last])
      nuclei[nuclei.length - 1] = frame
  }

  return { hopSeconds: options.hopSeconds, db, silenceDb, nuclei: nuclei.map(frame => frame * options.hopSeconds) }
}

export interface UntranscribedOptions {
  /** A token can account for a nucleus at most this far away, in seconds. @default 0.3 */
  readonly toleranceSeconds: number
  /** Consecutive unaccounted nuclei needed for a span. One nucleus alone is often a breath or a click. @default 2 */
  readonly minNuclei: number
}

export const defaultUntranscribedOptions: Readonly<UntranscribedOptions> = Object.freeze({
  toleranceSeconds: 0.3,
  minNuclei: 2,
})

/**
 * Finds runs of syllables that no reference token accounts for.
 *
 * An elongated sound does not produce a span: its token sits at its onset, and its flat tail adds
 * no nucleus. A span needs `minNuclei` new syllables in a row.
 *
 * One token accounts for one nucleus. This fits CJK, where a token is one syllable. A BPE token can
 * span several syllables, so English speech can produce false spans in fast multi-syllable words.
 *
 * `probe` is an optional decode with a blank penalty. Its tokens inside a span become the span's
 * variants, so the LLM gets a guess of the missing words.
 *
 * Tokens without times, as from online Paraformer, cannot account for nuclei, so such a reference gets no
 * spans. A reference without tokens still gets them, because none of its speech was transcribed.
 */
export function findUntranscribedSpeech(contour: IntensityContour, reference: Hypothesis, options: UntranscribedOptions, probe?: Hypothesis): UncertainSpan[] {
  if (reference.tokens.some(token => token.time === undefined && normalizeToken(token.text) !== ''))
    return []
  const tokenTimes = reference.tokens
    .filter(token => token.time !== undefined && normalizeToken(token.text) !== '')
    .map(token => token.time!)
  // Each token accounts for at most one nucleus, the nearest free one. A CJK token is one syllable,
  // so one token near three syllables still leaves two of them unaccounted.
  const pairs = tokenTimes.flatMap((time, token) => contour.nuclei.map((nucleus, index) => ({ token, index, distance: Math.abs(time - nucleus) })))
    .filter(pair => pair.distance <= options.toleranceSeconds)
    .toSorted((a, b) => a.distance - b.distance)
  const usedTokens = new Set<number>()
  const accounted = contour.nuclei.map(() => false)
  for (const pair of pairs) {
    if (usedTokens.has(pair.token) || accounted[pair.index])
      continue
    usedTokens.add(pair.token)
    accounted[pair.index] = true
  }

  const runs: number[][] = []
  let current: number[] = []
  for (const [index, nucleus] of contour.nuclei.entries()) {
    if (accounted[index]) {
      runs.push(current)
      current = []
      continue
    }
    current.push(nucleus)
  }
  runs.push(current)

  // A probe token is a guess only when no reference token has the same text near it.
  // Distance alone is not enough here, because the span sits next to the reference tokens.
  const probeGuesses = (probe?.tokens ?? []).filter(token => token.time !== undefined
    && normalizeToken(token.text) !== ''
    && !reference.tokens.some(known => known.time !== undefined
      && Math.abs(known.time - token.time!) <= options.toleranceSeconds
      && normalizeToken(known.text) === normalizeToken(token.text)))
  // Half a syllable of margin on each side, so the span covers the vowels and not only their peaks.
  const margin = 0.1
  return runs.filter(run => run.length >= options.minNuclei).map((run) => {
    const start = Math.max(0, run[0] - margin)
    const end = run.at(-1)! + margin
    const position = insertPosition(reference, start)
    const guess = joinTokens(probeGuesses.filter(token => token.time! >= start && token.time! <= end).map(token => token.text))
    return {
      kind: 'untranscribed' as const,
      start,
      end,
      tokenStart: position,
      tokenEnd: position,
      variants: guess === '' ? [] : [{ text: guess, count: 1 }],
    }
  })
}
