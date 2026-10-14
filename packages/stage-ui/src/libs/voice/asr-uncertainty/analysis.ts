import type { RawSegment } from './events'
import type { Perturbation } from './perturbation'

import { toSourceSeconds } from './perturbation'

/** One recognized token, placed on the clock of the unperturbed clip. */
export interface TimedToken {
  /** Token text as the model writes it. BPE tokens keep the `▁` word marker. */
  readonly text: string
  /** Seconds from the start of the original clip. Undefined when the model reports no token times. */
  readonly time?: number
  /** Log probability of the token. Only transducers report it. */
  readonly logProbability?: number
}

/** The tokens of one decode, in emission order. */
export interface Hypothesis {
  readonly tokens: readonly TimedToken[]
}

/** How often the perturbed decodes reproduce one reference token. */
export interface TokenAgreement {
  readonly token: TimedToken
  /**
   * Fraction of samples that emit the same token near the same audio time. The alignment also counts,
   * within `alignedToleranceSeconds`. Undefined when the reference has no token times.
   */
  readonly byTime?: number
  /**
   * Fraction of samples whose edit-distance alignment matches this token.
   * This is the text-only method. An early insertion or deletion can shift it for the rest of the clip.
   */
  readonly byText: number
}

/** Disagreement of the samples around one point of the original clip. */
export interface TimelineBin {
  /** Bin start, in seconds of the original clip. */
  readonly start: number
  /** Mean multiset Jaccard distance between each sample's tokens and the reference tokens near this time. */
  readonly disagreement: number
  /** Fraction of samples that emit a token here while the reference emits nothing nearby. */
  readonly extraEmission: number
}

/**
 * The kinds of spans that the consuming LLM can be told about.
 *
 * - `unstable`: the reference has tokens here, but most perturbed decodes hear something else.
 * - `dropped`: the reference has no tokens here, but many perturbed decodes do.
 * - `untranscribed`: the audio has syllables here that no reference token accounts for.
 */
export type UncertainSpanKind = 'unstable' | 'dropped' | 'untranscribed'

export interface UncertainSpan {
  readonly kind: UncertainSpanKind
  /** Seconds of the original clip. Undefined when the reference has no token times. */
  readonly start?: number
  readonly end?: number
  /**
   * Reference token range `[tokenStart, tokenEnd)` that the span covers.
   * `dropped` and `untranscribed` spans cover no token, so both values are the insert position.
   */
  readonly tokenStart: number
  readonly tokenEnd: number
  /** What the other decodes heard in this span, most frequent first. */
  readonly variants: readonly { readonly text: string, readonly count: number }[]
}

export interface Analysis {
  readonly tokens: readonly TokenAgreement[]
  /** Empty when the reference has no token times. */
  readonly timeline: readonly TimelineBin[]
  readonly spans: readonly UncertainSpan[]
}

export interface AnalysisOptions {
  /** Two tokens with the same text and times closer than this, in seconds, are the same token. */
  readonly toleranceSeconds: number
  /**
   * Two tokens that the edit-distance alignment matches are the same token up to this distance, in seconds.
   * Streaming transducers emit the last tokens of an utterance late, by up to one chunk.
   * A bound still keeps the alignment from matching the same word said at another time.
   */
  readonly alignedToleranceSeconds: number
  /** Width of one timeline bin, in seconds. */
  readonly binSeconds: number
  /** A reference token with agreement below this fraction is part of an `unstable` span. */
  readonly agreementThreshold: number
  /** A timeline bin where at least this fraction of samples emits extra tokens is part of a `dropped` span. */
  readonly extraEmissionThreshold: number
}

/** Defaults for one streaming model at 16 kHz. A Chinese character lasts about 0.2 s in casual speech. */
export const defaultAnalysisOptions: Readonly<AnalysisOptions> = Object.freeze({
  toleranceSeconds: 0.2,
  alignedToleranceSeconds: 0.6,
  binSeconds: 0.05,
  agreementThreshold: 0.6,
  extraEmissionThreshold: 0.4,
})

/**
 * Converts the raw segments of one decode to a hypothesis on the original clock.
 *
 * sherpa-onnx gives token times relative to their segment, and the segment start relative to the
 * decoded audio. The decoded audio is the perturbed copy, so {@link toSourceSeconds} maps the sum back.
 */
export function toHypothesis(segments: readonly RawSegment[], perturbation: Perturbation): Hypothesis {
  return {
    tokens: segments.flatMap((segment) => {
      const timed = segment.timestamps.length === segment.tokens.length
      return segment.tokens.map((text, index) => ({
        text,
        time: timed ? toSourceSeconds(segment.startTime + segment.timestamps[index], perturbation) : undefined,
        logProbability: segment.ysProbs[index],
      }))
    }),
  }
}

/** Sentence punctuation that sherpa-onnx models emit as tokens. It attaches to the word before it. */
const trailingPunctuation = / ([,.!?;:，。！？；：、])/gu

/**
 * Comparison key of a token. Case, punctuation, and the BPE word marker do not change what was heard.
 * Punctuation tokens get an empty key, so the probe ignores them.
 *
 * @example
 * normalizeToken('▁Hello,')
 * // => 'hello'
 */
export function normalizeToken(text: string): string {
  return text.replaceAll('▁', '').replace(/\p{P}/gu, '').trim().toLowerCase()
}

/**
 * A space between two of these characters is a token boundary, not a word boundary. X-ASR marks every Chinese
 * character as a word start, and phonetic matching reads a space as the end of a phrase.
 */
const spaceBetweenCjk = /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303F\uFF00-\uFFEF])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303F\uFF00-\uFFEF])/gu

/**
 * Joins tokens to readable text. The BPE word marker becomes a space, except between CJK characters.
 * Punctuation attaches to the word before it.
 *
 * @example
 * joinTokens(['▁HE', 'LLO', ' ,', '▁你', '▁好'])
 * // => 'HELLO, 你好'
 */
export function joinTokens(tokens: readonly string[]): string {
  return tokens.join('').replaceAll('▁', ' ').replace(/\s+/g, ' ').replace(trailingPunctuation, '$1').replace(spaceBetweenCjk, '').trim()
}

/** The {@link joinTokens} text of a decode, with the place of each token in it. */
export interface LocatedTranscript {
  readonly text: string
  /**
   * UTF-16 range `[start, end)` of each token in `text`, in token order.
   * A token without visible characters, such as a lone word marker, gets an empty range where it stands.
   */
  readonly ranges: readonly (readonly [number, number])[]
}

/**
 * Joins tokens as {@link joinTokens} does and finds each token in the result, so a token span maps to transcript text.
 *
 * The join only changes white space and moves punctuation onto the word before it, so the visible characters of
 * each token appear in order. The search starts after the previous token, so a repeated word maps to its own place.
 *
 * @example
 * locateTokens(['▁HE', 'LLO', ' ,', '▁你', '好'])
 * // => { text: 'HELLO, 你好', ranges: [[0, 2], [2, 5], [5, 6], [7, 8], [8, 9]] }
 */
export function locateTokens(tokens: readonly string[]): LocatedTranscript {
  const text = joinTokens(tokens)
  let cursor = 0
  const ranges = tokens.map((token): readonly [number, number] => {
    const visible = token.replaceAll('▁', ' ').replace(/\s+/g, ' ').trim()
    const found = visible === '' ? -1 : text.indexOf(visible, cursor)
    if (found < 0)
      return [cursor, cursor]
    cursor = found + visible.length
    return [found, cursor]
  })
  return { text, ranges }
}

interface AlignedPair {
  readonly reference?: number
  readonly hypothesis?: number
  readonly match: boolean
}

/**
 * Levenshtein alignment of two hypotheses over their non-empty keys. Pair indices refer to the full token lists.
 * Ties prefer the diagonal, so a substitution stays one pair.
 */
function align(referenceHypothesis: Hypothesis, sampleHypothesis: Hypothesis): AlignedPair[] {
  const keyed = (hypothesis: Hypothesis) => hypothesis.tokens.flatMap((token, index) => {
    const key = normalizeToken(token.text)
    return key === '' ? [] : [{ key, index }]
  })
  const referenceKeyed = keyed(referenceHypothesis)
  const sampleKeyed = keyed(sampleHypothesis)
  const reference = referenceKeyed.map(item => item.key)
  const hypothesis = sampleKeyed.map(item => item.key)

  const rows = reference.length + 1
  const columns = hypothesis.length + 1
  const cost = new Uint32Array(rows * columns)
  for (let row = 0; row < rows; row++)
    cost[row * columns] = row
  for (let column = 0; column < columns; column++)
    cost[column] = column
  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const substitution = cost[(row - 1) * columns + column - 1] + (reference[row - 1] === hypothesis[column - 1] ? 0 : 1)
      const deletion = cost[(row - 1) * columns + column] + 1
      const insertion = cost[row * columns + column - 1] + 1
      cost[row * columns + column] = Math.min(substitution, deletion, insertion)
    }
  }

  const pairs: AlignedPair[] = []
  let row = reference.length
  let column = hypothesis.length
  while (row > 0 || column > 0) {
    const current = cost[row * columns + column]
    if (row > 0 && column > 0) {
      const match = reference[row - 1] === hypothesis[column - 1]
      if (current === cost[(row - 1) * columns + column - 1] + (match ? 0 : 1)) {
        pairs.push({ reference: referenceKeyed[row - 1].index, hypothesis: sampleKeyed[column - 1].index, match })
        row--
        column--
        continue
      }
    }
    if (row > 0 && current === cost[(row - 1) * columns + column] + 1) {
      pairs.push({ reference: referenceKeyed[row - 1].index, match: false })
      row--
      continue
    }
    pairs.push({ hypothesis: sampleKeyed[column - 1].index, match: false })
    column--
  }
  return pairs.reverse()
}

function hasText(token: TimedToken) {
  return normalizeToken(token.text) !== ''
}

/**
 * Pairs of reference and sample token indices that are the same token.
 *
 * Two rules decide it. The same text within `toleranceSeconds` is the same token, wherever the alignment
 * puts it, so an early insertion cannot shift later comparisons. An alignment match within
 * `alignedToleranceSeconds` is also the same token, which absorbs late emission at the end of an utterance.
 * Without token times only the alignment decides.
 */
function correspondences(reference: Hypothesis, sample: Hypothesis, pairs: readonly AlignedPair[], options: AnalysisOptions) {
  const result: { reference: number, sample: number }[] = []
  for (const [referenceIndex, referenceToken] of reference.tokens.entries()) {
    const key = normalizeToken(referenceToken.text)
    if (key === '' || referenceToken.time === undefined)
      continue
    for (const [sampleIndex, sampleToken] of sample.tokens.entries()) {
      if (sampleToken.time !== undefined && Math.abs(sampleToken.time - referenceToken.time) <= options.toleranceSeconds && normalizeToken(sampleToken.text) === key)
        result.push({ reference: referenceIndex, sample: sampleIndex })
    }
  }
  for (const pair of pairs) {
    if (!pair.match || pair.reference === undefined || pair.hypothesis === undefined)
      continue
    const referenceTime = reference.tokens[pair.reference].time
    const sampleTime = sample.tokens[pair.hypothesis].time
    if (referenceTime === undefined || sampleTime === undefined || Math.abs(referenceTime - sampleTime) <= options.alignedToleranceSeconds)
      result.push({ reference: pair.reference, sample: pair.hypothesis })
  }
  return result
}

/**
 * Tokens of a sample that are not the same token as any reference token, and have no reference token
 * of any text near them. These are candidates for speech that the reference dropped.
 */
function findExtraTokens(reference: Hypothesis, sample: Hypothesis, matched: ReadonlySet<number>, toleranceSeconds: number): TimedToken[] {
  const referenceTimes = reference.tokens.filter(hasText).flatMap(token => token.time === undefined ? [] : [token.time])
  return sample.tokens.filter((token, index) => token.time !== undefined
    && hasText(token)
    && !matched.has(index)
    && referenceTimes.every(time => Math.abs(time - token.time!) > toleranceSeconds))
}

function countVariants(texts: readonly string[]) {
  const counts = new Map<string, number>()
  for (const text of texts)
    counts.set(text, (counts.get(text) ?? 0) + 1)
  return [...counts].map(([text, count]) => ({ text, count })).toSorted((a, b) => b.count - a.count)
}

/** Number of reference tokens that start before `seconds`. A span at that time is inserted there. */
export function insertPosition(reference: Hypothesis, seconds: number): number {
  const index = reference.tokens.findIndex(token => token.time !== undefined && token.time >= seconds)
  return index === -1 ? reference.tokens.length : index
}

/**
 * Compares the reference decode with the perturbed decodes and finds the spans where they disagree.
 *
 * Per-token agreement is computed twice. `byTime` anchors each comparison to audio time, so an
 * insertion early in a sample cannot shift later comparisons. `byText` is the edit-distance method,
 * kept beside it for comparison. Spans use `byTime` when the model reports token times.
 * Punctuation tokens are skipped, because their presence varies more than the words do.
 */
export function analyzeHypotheses(reference: Hypothesis, samples: readonly Hypothesis[], durationSeconds: number, options: AnalysisOptions): Analysis {
  const alignments = samples.map(sample => align(reference, sample))
  const matches = samples.map((sample, index) => correspondences(reference, sample, alignments[index], options))

  const textMatches = new Uint32Array(reference.tokens.length)
  const timeMatches = new Uint32Array(reference.tokens.length)
  for (const [index, pairs] of alignments.entries()) {
    for (const pair of pairs) {
      if (pair.match && pair.reference !== undefined)
        textMatches[pair.reference]++
    }
    for (const referenceIndex of new Set(matches[index].map(match => match.reference)))
      timeMatches[referenceIndex]++
  }

  // With no samples, nothing disagrees, so every token is fully stable.
  const fraction = (count: number) => samples.length === 0 ? 1 : count / samples.length
  const tokens = reference.tokens.map((token, index): TokenAgreement => ({
    token,
    byTime: token.time === undefined ? undefined : fraction(timeMatches[index]),
    byText: fraction(textMatches[index]),
  }))

  const timed = reference.tokens.some(token => token.time !== undefined)
  const extraTokens = samples.map((sample, index) => findExtraTokens(reference, sample, new Set(matches[index].map(match => match.sample)), options.toleranceSeconds))
  const timeline = timed ? measureTimeline(reference, samples, extraTokens, durationSeconds, options) : []

  const spans = [
    ...findUnstableSpans(reference, tokens, samples, alignments, options),
    ...findDroppedSpans(reference, timeline, extraTokens, options),
  ]
  return { tokens, timeline, spans }
}

function measureTimeline(reference: Hypothesis, samples: readonly Hypothesis[], extraTokens: readonly TimedToken[][], durationSeconds: number, options: AnalysisOptions): TimelineBin[] {
  const tolerance = options.toleranceSeconds
  const keysNear = (hypothesis: Hypothesis, center: number) => hypothesis.tokens
    .filter(token => token.time !== undefined && Math.abs(token.time - center) <= tolerance && hasText(token))
    .map(token => normalizeToken(token.text))

  const bins: TimelineBin[] = []
  for (let start = 0; start < durationSeconds; start += options.binSeconds) {
    const center = start + options.binSeconds / 2
    const referenceKeys = keysNear(reference, center)
    let distance = 0
    for (const sample of samples)
      distance += jaccardDistance(referenceKeys, keysNear(sample, center))

    // Half the tolerance keeps an extra token from widening the run on both sides by a full tolerance.
    const emitting = extraTokens.filter(tokens => tokens.some(token => Math.abs(token.time! - center) <= tolerance / 2)).length
    bins.push({
      start,
      disagreement: samples.length === 0 ? 0 : distance / samples.length,
      extraEmission: samples.length === 0 ? 0 : emitting / samples.length,
    })
  }
  return bins
}

/** Multiset Jaccard distance. Two empty sets agree. */
function jaccardDistance(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0)
    return 0
  const remaining = new Map<string, number>()
  for (const key of a)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  let intersection = 0
  for (const key of b) {
    const count = remaining.get(key) ?? 0
    if (count > 0) {
      intersection++
      remaining.set(key, count - 1)
    }
  }
  return 1 - intersection / (a.length + b.length - intersection)
}

function findUnstableSpans(reference: Hypothesis, tokens: readonly TokenAgreement[], samples: readonly Hypothesis[], alignments: readonly AlignedPair[][], options: AnalysisOptions): UncertainSpan[] {
  const runs: [number, number][] = []
  for (const [index, agreement] of tokens.entries()) {
    // Tokens with no text, such as a lone BPE word marker, neither start nor break a run.
    if (!hasText(agreement.token))
      continue
    const value = agreement.byTime ?? agreement.byText
    if (value >= options.agreementThreshold)
      continue
    const last = runs.at(-1)
    const previousWithText = tokens.slice(0, index).findLastIndex(previous => hasText(previous.token))
    if (last && last[1] - 1 === previousWithText)
      last[1] = index + 1
    else
      runs.push([index, index + 1])
  }

  return runs.map(([tokenStart, tokenEnd]) => {
    // Variants come from the text alignment. Inside a short span the alignment is reliable, because the
    // stable tokens on both sides anchor it. Insertions inside the span belong to it.
    const heard = alignments.map((pairs, sampleIndex) => {
      const first = pairs.findIndex(pair => pair.reference !== undefined && pair.reference >= tokenStart)
      const after = pairs.findIndex(pair => pair.reference !== undefined && pair.reference >= tokenEnd)
      const covered = pairs.slice(first, after === -1 ? undefined : after)
      return joinTokens(covered.flatMap(pair => pair.hypothesis === undefined ? [] : [samples[sampleIndex].tokens[pair.hypothesis].text]))
    })
    const times = reference.tokens.slice(tokenStart, tokenEnd).flatMap(token => token.time === undefined ? [] : [token.time])
    return {
      kind: 'unstable' as const,
      start: times.length === 0 ? undefined : Math.max(0, Math.min(...times) - options.toleranceSeconds / 2),
      end: times.length === 0 ? undefined : Math.max(...times) + options.toleranceSeconds / 2,
      tokenStart,
      tokenEnd,
      variants: countVariants(heard),
    }
  })
}

function findDroppedSpans(reference: Hypothesis, timeline: readonly TimelineBin[], extraTokens: readonly TimedToken[][], options: AnalysisOptions): UncertainSpan[] {
  const runs: [number, number][] = []
  for (const bin of timeline) {
    if (bin.extraEmission < options.extraEmissionThreshold)
      continue
    const last = runs.at(-1)
    if (last && Math.abs(last[1] - bin.start) < options.binSeconds / 2)
      last[1] = bin.start + options.binSeconds
    else
      runs.push([bin.start, bin.start + options.binSeconds])
  }

  return runs.map(([start, end]) => {
    const position = insertPosition(reference, start)
    const heard = extraTokens
      .map(tokens => joinTokens(tokens.filter(token => token.time! >= start - options.toleranceSeconds / 2 && token.time! <= end + options.toleranceSeconds / 2).map(token => token.text)))
      .filter(text => text !== '')
    return { kind: 'dropped' as const, start, end, tokenStart: position, tokenEnd: position, variants: countVariants(heard) }
  })
}

/**
 * Renders the reference transcript with span markers, as the consuming LLM would read it.
 *
 * @example
 * formatForLlm({ tokens: [{ text: '我' }, { text: '流' }, { text: '氓' }] }, [{ kind: 'unstable', tokenStart: 1, tokenEnd: 3, variants: [{ text: '硫磺', count: 3 }] }])
 * // => '我 [unclear: "流氓", also heard "硫磺"]'
 */
export function formatForLlm(reference: Hypothesis, spans: readonly UncertainSpan[]): string {
  const texts = reference.tokens.map(token => token.text)
  const inserts = spans.filter(span => span.kind !== 'unstable').toSorted((a, b) => a.tokenStart - b.tokenStart)
  const replacements = spans.filter(span => span.kind === 'unstable').toSorted((a, b) => a.tokenStart - b.tokenStart)

  const parts: string[] = []
  let pending: string[] = []
  const flush = () => {
    if (pending.length > 0)
      parts.push(joinTokens(pending))
    pending = []
  }

  let insertIndex = 0
  const emitInsertsBefore = (position: number) => {
    while (insertIndex < inserts.length && inserts[insertIndex].tokenStart <= position) {
      flush()
      parts.push(describeSpan(inserts[insertIndex], ''))
      insertIndex++
    }
  }

  let index = 0
  while (index <= texts.length) {
    emitInsertsBefore(index)
    if (index === texts.length)
      break
    const replacement = replacements.find(span => span.tokenStart === index)
    if (!replacement) {
      pending.push(texts[index])
      index++
      continue
    }
    flush()
    parts.push(describeSpan(replacement, joinTokens(texts.slice(replacement.tokenStart, replacement.tokenEnd))))
    index = replacement.tokenEnd
  }
  flush()
  return parts.join(' ').replace(trailingPunctuation, '$1')
}

function describeSpan(span: UncertainSpan, referenceText: string): string {
  const others = span.variants
    .map(variant => variant.text)
    .filter(text => text !== '' && text !== referenceText)
    .slice(0, 3)
    .map(text => `"${text}"`)
  const seconds = span.start === undefined || span.end === undefined ? '' : ` ~${(span.end - span.start).toFixed(1)}s`

  if (span.kind === 'unstable')
    return others.length === 0 ? `[unclear: "${referenceText}"]` : `[unclear: "${referenceText}", also heard ${others.join(', ')}]`
  if (span.kind === 'dropped')
    return others.length === 0 ? `[possibly missed speech${seconds}]` : `[possibly missed speech${seconds}: ${others.join(' or ')}]`
  return others.length === 0 ? `[untranscribed speech${seconds}]` : `[untranscribed speech${seconds}, maybe ${others.join(' or ')}]`
}
