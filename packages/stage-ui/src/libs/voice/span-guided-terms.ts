import type { LocatedTranscript, UncertainSpan, UncertainSpanKind } from './asr-uncertainty/analysis'
import type { PhoneticCandidate, PhoneticLanguage, PhoneticMatchOptions } from './phonetic-match'
import type { PhoneticVocabularyEntry } from './phonetic-vocabulary'

import { merge } from '@moeru/std'

import { createPhoneticMatcher } from './phonetic-match'

/**
 * A vocabulary term that sounds like what some decode heard inside an uncertain span.
 *
 * `start` and `end` are transcript offsets. A candidate from a variant covers the whole span, because the variant
 * replaces the span text. A `dropped` or `untranscribed` span has no transcript text, so its candidates can be empty
 * ranges at the insert position.
 */
export interface SpanCandidate extends PhoneticCandidate {
  /** Index of the backing span in the analyzed spans. */
  readonly spanIndex: number
  readonly kind: UncertainSpanKind
  /** What the matching decode heard in the span: the transcript text, or a variant from the other decodes. */
  readonly heard: string
  /** Decodes that heard `heard`. Undefined for the transcript text, which the clean decode heard. */
  readonly heardCount?: number
}

export interface SpanMatchOptions extends Pick<PhoneticMatchOptions, 'threshold' | 'guessedThreshold'> {
  /**
   * Transcript tokens on each side of a span that the match can also read. A span is often only part of a word,
   * for example one unstable syllable of `流氓怪`, so the term needs its neighbors to match.
   * @default 6
   */
  contextTokens: number
}

/**
 * The span threshold is looser than the threshold of the whole transcript, because the other decodes already
 * show that the audio is unclear there.
 */
const defaultSpanMatchOptions: SpanMatchOptions = { threshold: 0.7, guessedThreshold: 0.65, contextTokens: 6 }

/** Text that a decode heard, between transcript text on both sides. */
interface HeardWindow {
  readonly text: string
  /** Offsets of the heard text in `text`. */
  readonly middleStart: number
  readonly middleEnd: number
  /** Offset in `text` where the transcript text after the span starts. */
  readonly afterStart: number
}

/** Two English words or numbers need a space between them. CJK text and punctuation do not. */
function needsSpace(left: string | undefined, right: string | undefined) {
  return left !== undefined && right !== undefined && /[a-z0-9]/i.test(left) && /[a-z0-9]/i.test(right)
}

/**
 * Finds a written form in text, ignoring case. An English form must be a whole word, so `react` is not found in
 * `reactor`. CJK text has no word boundaries, so a CJK form can start anywhere.
 */
function findForm(folded: string, form: string): number[] {
  const found: number[] = []
  for (let at = folded.indexOf(form); at >= 0; at = folded.indexOf(form, at + 1)) {
    if (!needsSpace(folded[at - 1], form[0]) && !needsSpace(form.at(-1), folded[at + form.length]))
      found.push(at)
  }
  return found
}

/**
 * Puts the heard text between the transcript text around the span.
 *
 * A variant that replaces span text keeps the transcript's boundaries: a span can cover only part of a word, for
 * example `STAN` of `ZUSTAN`, and a space there would split the word for the English tokenizer. Text heard at an
 * insert position is a new word, so it gets a space next to English words.
 */
function heardWindow(before: string, middle: string, after: string, inserted: boolean): HeardWindow {
  const left = inserted && needsSpace(before.at(-1), middle[0]) ? ' ' : ''
  const right = inserted && needsSpace(middle.at(-1), after[0]) ? ' ' : ''
  const middleStart = before.length + left.length
  const middleEnd = middleStart + middle.length
  return { text: `${before}${left}${middle}${right}${after}`, middleStart, middleEnd, afterStart: middleEnd + right.length }
}

/**
 * The transcript range of a span. An `unstable` span covers its tokens. The other kinds cover no token, so they get
 * an empty range at the start of the token after them.
 */
export function spanRange(span: UncertainSpan, transcript: LocatedTranscript): readonly [number, number] {
  const { ranges, text } = transcript
  if (span.tokenEnd > span.tokenStart)
    return [ranges[span.tokenStart][0], ranges[span.tokenEnd - 1][1]]
  const at = ranges[span.tokenStart]?.[0] ?? text.length
  return [at, at]
}

/**
 * Matches vocabulary terms against what the decodes heard in each uncertain span.
 *
 * Each span is read once with its transcript text and once with each variant, with `contextTokens` of transcript on
 * each side. Only matches that touch the span count. A variant that already contains a written form of a term is a
 * match with score 1, because the matcher skips text that already spells the term. A candidate whose transcript
 * range already spells the term is dropped, because the transcript needs no change there.
 *
 * Use when:
 * - Uncertainty must decide which hotwords to boost. Pass the hotword phrases as entries.
 * - Post-ASR suggestions must prefer the spans that the probe found. Pass the domain vocabulary.
 *
 * Returns:
 * - At most one candidate per span and term, the highest score first.
 */
export function matchUncertainSpans(
  transcript: LocatedTranscript,
  spans: readonly UncertainSpan[],
  entries: readonly PhoneticVocabularyEntry[],
  languages: readonly PhoneticLanguage[],
  options?: Partial<SpanMatchOptions>,
): SpanCandidate[] {
  const { threshold, guessedThreshold, contextTokens } = merge(defaultSpanMatchOptions, options)
  if (!entries.length || !spans.length)
    return []
  const match = createPhoneticMatcher(entries, languages, { threshold, guessedThreshold })
  const { text, ranges } = transcript
  const formsOf = new Map(entries.map(entry => [entry.term, entry.writtenForms.map(form => form.toLowerCase())]))
  const best = new Map<string, SpanCandidate>()
  const keep = (candidate: SpanCandidate) => {
    // A variant can differ from the transcript only in case, for example `ZUSTAND` for `Zustand`. The transcript
    // already spells the term there, so there is nothing to boost or suggest.
    const spelled = candidate.span.toLowerCase()
    if (formsOf.get(candidate.term)?.some(form => findForm(spelled, form).length))
      return
    const key = `${candidate.spanIndex}:${candidate.term}`
    const kept = best.get(key)
    if (!kept || candidate.score > kept.score || (candidate.score === kept.score && (candidate.heardCount ?? 0) > (kept.heardCount ?? 0)))
      best.set(key, candidate)
  }

  spans.forEach((span, spanIndex) => {
    const [spanStart, spanEnd] = spanRange(span, transcript)
    const contextStart = ranges[Math.max(0, span.tokenStart - contextTokens)]?.[0] ?? spanStart
    const contextEnd = ranges[Math.min(ranges.length, span.tokenEnd + contextTokens) - 1]?.[1] ?? spanEnd
    const before = text.slice(contextStart, spanStart)
    const after = text.slice(spanEnd, Math.max(spanEnd, contextEnd))
    const spanText = text.slice(spanStart, spanEnd)

    // An offset in the heard window maps back to the transcript. Offsets inside the heard text map to the span edges.
    const toTranscript = (window: HeardWindow, offset: number, edge: 'start' | 'end') => {
      if (offset <= before.length)
        return contextStart + offset
      if (offset >= window.afterStart)
        return spanEnd + offset - window.afterStart
      return edge === 'start' ? spanStart : spanEnd
    }

    const heardTexts = [
      ...(spanText.trim() ? [{ heard: spanText, count: undefined }] : []),
      ...span.variants.filter(variant => variant.text.trim() && variant.text !== spanText).map(variant => ({ heard: variant.text, count: variant.count })),
    ]
    for (const { heard, count } of heardTexts) {
      const base = { spanIndex, kind: span.kind, heard, heardCount: count }
      const window = heardWindow(before, heard, after, spanStart === spanEnd)
      // The matcher skips text that already spells a term. A variant can complete the spelling with its neighbors,
      // for example `STAND` after `ZU`, so a written form that touches the variant is a match with score 1.
      if (count !== undefined) {
        const folded = window.text.toLowerCase()
        for (const entry of entries) {
          for (const form of entry.writtenForms.map(written => written.toLowerCase())) {
            for (const at of findForm(folded, form)) {
              if (at + form.length <= window.middleStart || at >= window.middleEnd)
                continue
              const start = toTranscript(window, at, 'start')
              const end = toTranscript(window, at + form.length, 'end')
              keep({ ...base, span: text.slice(start, end), candidate: entry.writtenForms[0] ?? entry.term, term: entry.term, score: 1, source: entry.source, description: entry.description, start, end })
            }
          }
        }
      }

      for (const found of match(window.text)) {
        if (found.end <= window.middleStart || found.start >= window.middleEnd)
          continue
        const start = toTranscript(window, found.start, 'start')
        const end = toTranscript(window, found.end, 'end')
        keep({ ...found, ...base, span: text.slice(start, end), start, end })
      }
    }
  })

  return [...best.values()].sort((a, b) => b.score - a.score)
}

/**
 * Turns hotword phrases into vocabulary entries, so they can match uncertain spans.
 * A phrase that `pronounce` cannot read gets no entry, so it keeps the base score.
 */
export function phraseEntries(
  phrases: readonly string[],
  pronounce: (text: string) => readonly string[] | undefined,
  label: Pick<PhoneticVocabularyEntry, 'source' | 'description'>,
): PhoneticVocabularyEntry[] {
  return phrases.flatMap((phrase) => {
    const tokens = pronounce(phrase)
    return tokens?.length ? [{ ...label, term: phrase, writtenForms: [phrase], pronunciations: [[...tokens]] }] : []
  })
}

/** One phrase of a hotword list, with its boost score. */
export interface HotwordBoost {
  readonly phrase: string
  /** sherpa-onnx boost score of the phrase. The decoder adds it to the score of each matched token path. */
  readonly score: number
  /** The strongest span match that raised the score. Undefined keeps the base score. */
  readonly match?: SpanCandidate
  /** True for a domain term that joined the list only through a span match. */
  readonly fromVocabulary?: boolean
}

export interface HotwordBoostOptions {
  /**
   * Score of a phrase that no uncertain span sounds like.
   * @default 1.5, the default `hotwordsScore` of sherpa-onnx.
   */
  baseScore: number
  /** @default 4 */
  boostScore: number
  /**
   * `all` keeps every phrase and raises the matched ones.
   * `matched` sends only the matched phrases, so a long list cannot cause insertions in clear speech.
   * @default 'all'
   */
  scope: 'all' | 'matched'
}

const defaultBoostOptions: HotwordBoostOptions = { baseScore: 1.5, boostScore: 4, scope: 'all' }

/**
 * Raises the score of the hotwords that sound like an uncertain span.
 *
 * `phraseCandidates` come from {@link matchUncertainSpans} with {@link phraseEntries} of `phrases`.
 * `vocabularyCandidates` are optional domain terms. A domain term never joins the list on its own. It joins only
 * when an uncertain span sounds like it, so a guessed term cannot insert itself into clear speech.
 */
export function boostHotwords(
  phrases: readonly string[],
  phraseCandidates: readonly SpanCandidate[],
  options?: Partial<HotwordBoostOptions>,
  vocabularyCandidates: readonly SpanCandidate[] = [],
): HotwordBoost[] {
  const { baseScore, boostScore, scope } = merge(defaultBoostOptions, options)
  const strongest = (candidates: readonly SpanCandidate[], key: (candidate: SpanCandidate) => string) => {
    const found = new Map<string, SpanCandidate>()
    for (const candidate of candidates) {
      const kept = found.get(key(candidate))
      if (!kept || candidate.score > kept.score)
        found.set(key(candidate), candidate)
    }
    return found
  }

  const byPhrase = strongest(phraseCandidates, candidate => candidate.term)
  const boosts: HotwordBoost[] = phrases.map((phrase) => {
    const match = byPhrase.get(phrase)
    return { phrase, score: match ? boostScore : baseScore, match }
  })
  const listed = new Set(phrases.map(phrase => phrase.toLowerCase()))
  for (const [phrase, match] of strongest(vocabularyCandidates, candidate => candidate.candidate)) {
    if (!listed.has(phrase.toLowerCase()))
      boosts.push({ phrase, score: boostScore, match, fromVocabulary: true })
  }
  return scope === 'matched' ? boosts.filter(boost => boost.match) : boosts
}

/** A post-ASR candidate, with the uncertain span that backs it. */
export interface GuidedCandidate extends PhoneticCandidate {
  /** Undefined when no uncertain span overlaps the candidate. */
  readonly backing?: Pick<SpanCandidate, 'spanIndex' | 'kind' | 'heard' | 'heardCount'>
}

/**
 * How post-ASR matching uses the uncertain spans.
 *
 * - `first`: suggestions inside uncertain spans come first. Other suggestions follow.
 * - `only`: only suggestions inside uncertain spans remain.
 * - `off`: the plain phonetic match of the whole transcript, as without a probe.
 */
export type GuidedScope = 'first' | 'only' | 'off'

/** True when two transcript ranges share text. An empty range at an insert position counts when it touches the other range. */
function overlaps(a: { readonly start: number, readonly end: number }, b: { readonly start: number, readonly end: number }) {
  return a.start === a.end || b.start === b.end ? a.start <= b.end && b.start <= a.end : a.start < b.end && b.start < a.end
}

/**
 * Merges the whole-transcript candidates with the span candidates and orders them by `scope`.
 *
 * A whole-transcript candidate that overlaps a span, or contains its insert position, gets that span as backing. A term with candidates from both
 * sources over the same text keeps the higher score and the backing.
 */
export function guideCandidates(
  whole: readonly PhoneticCandidate[],
  spanCandidates: readonly SpanCandidate[],
  transcript: LocatedTranscript,
  spans: readonly UncertainSpan[],
  scope: GuidedScope,
): GuidedCandidate[] {
  if (scope === 'off')
    return [...whole]

  const ranges = spans.map((span) => {
    const [start, end] = spanRange(span, transcript)
    return { start, end }
  })
  const merged: GuidedCandidate[] = whole.map((candidate) => {
    // An insert position backs a candidate only from inside it. A word that ends where speech was dropped is not
    // the dropped speech. Span matching already reads such a word together with the dropped variants.
    const spanIndex = ranges.findIndex(range => range.start === range.end ? candidate.start < range.start && range.start < candidate.end : overlaps(candidate, range))
    if (spanIndex < 0)
      return candidate
    const { start, end } = ranges[spanIndex]
    return { ...candidate, backing: { spanIndex, kind: spans[spanIndex].kind, heard: transcript.text.slice(start, end) } }
  })
  for (const { spanIndex, kind, heard, heardCount, ...candidate } of spanCandidates) {
    const guided: GuidedCandidate = { ...candidate, backing: { spanIndex, kind, heard, heardCount } }
    const same = merged.findIndex(other => other.term === candidate.term && overlaps(other, candidate))
    if (same < 0) {
      merged.push(guided)
      continue
    }
    const existing = merged[same]
    merged[same] = candidate.score > existing.score ? guided : { ...existing, backing: existing.backing ?? guided.backing }
  }

  const byScore = (a: GuidedCandidate, b: GuidedCandidate) => b.score - a.score
  const backed = merged.filter(candidate => candidate.backing).sort(byScore)
  if (scope === 'only')
    return backed
  return [...backed, ...merged.filter(candidate => !candidate.backing).sort(byScore)]
}

/**
 * Chooses the suggestions that the conversation model reads, in the order of `candidates`.
 *
 * Like `selectSuggestions`, the first candidate claims its text. An empty range at an insert position also claims
 * that position, so one dropped span gets one suggestion.
 */
export function selectGuidedSuggestions(candidates: readonly GuidedCandidate[], limit = 3): GuidedCandidate[] {
  const chosen: GuidedCandidate[] = []
  for (const candidate of candidates) {
    if (chosen.length >= limit)
      break
    if (!chosen.some(other => overlaps(candidate, other)))
      chosen.push(candidate)
  }
  return chosen
}
