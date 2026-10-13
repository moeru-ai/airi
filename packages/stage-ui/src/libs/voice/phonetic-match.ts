import type { PhoneticVocabularyEntry } from './phonetic-vocabulary'

import { merge } from '@moeru/std'

/** One possible mishearing that the conversation model can accept or ignore. The transcript itself never changes. */
export interface PhoneticSuggestion {
  /** The transcript text that sounds like the term. */
  readonly span: string
  /** The written form that the speaker probably meant. */
  readonly candidate: string
  readonly term: string
  /** Phonetic similarity from 0 to 1. It is a ranking value, not a calibrated probability. */
  readonly score: number
  readonly source: string
  readonly description: string
}

/** One sound unit of the transcript, for example a Mandarin syllable or a Japanese mora. */
export interface PhoneticUnit {
  readonly tokens: readonly string[]
  /** UTF-16 offsets of the unit's characters in the transcript. */
  readonly start: number
  readonly end: number
  /**
   * The language guessed the tokens from spelling, because its dictionary does not have the word.
   * A recognizer writes a non-word when it cannot place the sound, so such a window uses the looser threshold.
   */
  readonly guessed?: boolean
}

/** A suggestion with the transcript offsets of its span, so a later step can rerank and then remove overlaps. */
export interface PhoneticCandidate extends PhoneticSuggestion {
  readonly start: number
  readonly end: number
}

/**
 * Converts one language between text and tokens, and prices token substitutions for that language.
 *
 * The matcher is shared. Each language owns only its tokenizer and its cost table, so a Korean jamo or a Japanese
 * kana adapter plugs in without a change to the matcher.
 */
export interface PhoneticLanguage {
  /** Splits transcript text into runs of units. A match window never crosses two runs. */
  units: (text: string) => PhoneticUnit[][]
  /**
   * The transcript window sizes, in units, that can sound like a vocabulary pronunciation.
   * Returns `undefined` when the pronunciation uses tokens of another language, or is too short to match safely.
   */
  windows: (tokens: readonly string[]) => { readonly min: number, readonly max: number } | undefined
  /** The cost from 0 to 1 of hearing token `a` for token `b`. An extra heard token costs 1. */
  substitutionCost: (a: string, b: string) => number
  /**
   * The cost from 0 to 1 of a vocabulary token that the transcript does not have, for example a dropped unstressed vowel.
   * Omission makes every dropped token cost 1.
   */
  dropCost?: (expected: string) => number
}

export interface PhoneticMatchOptions {
  /**
   * The lowest similarity that becomes a suggestion.
   * With six Mandarin tokens, one unrelated initial and one tone change score 0.82, so `流氓怪` still reaches `硫方怪`.
   * @default 0.78
   */
  threshold: number
  /**
   * The lowest similarity for a window with a word that the language guessed from spelling.
   * A real word that sounds close is often just that word, but a non-word is a sign of a mishearing.
   * @default 0.7
   */
  guessedThreshold: number
  /**
   * The most candidates for one transcript. Candidates can overlap, so a reranker can choose between two terms for one span.
   * @default 20
   */
  limit: number
}

const defaultOptions: PhoneticMatchOptions = { threshold: 0.78, guessedThreshold: 0.7, limit: 20 }

const dropAll = () => 1

/** Weighted edit distance, normalized to a similarity from 0 to 1. */
function similarity(heard: readonly string[], expected: readonly string[], language: PhoneticLanguage) {
  const dropCost = language.dropCost ?? dropAll
  let previous = [0]
  for (let j = 1; j <= expected.length; j++)
    previous[j] = previous[j - 1] + dropCost(expected[j - 1])
  for (let i = 1; i <= heard.length; i++) {
    const current = [i]
    for (let j = 1; j <= expected.length; j++)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + dropCost(expected[j - 1]), previous[j - 1] + language.substitutionCost(heard[i - 1], expected[j - 1]))
    previous = current
  }
  return 1 - previous[expected.length] / Math.max(heard.length, expected.length)
}

/**
 * Creates a matcher that compares every unit n-gram of a transcript with every vocabulary pronunciation.
 *
 * The matcher checks each phrase, not only text that looks wrong, because a mishearing is often a plausible word,
 * for example `流氓怪` for `硫方怪`. Each language chooses the window sizes for a pronunciation, so a dropped or an
 * extra unit still matches.
 *
 * Each language reads only the pronunciations in its own tokens. Mixed-language phrases do not match.
 *
 * Returns candidates with the highest score first. Candidates can overlap. {@link selectSuggestions} removes the overlaps.
 * A span that already contains a written form of the term is not a candidate.
 */
export function createPhoneticMatcher(entries: readonly PhoneticVocabularyEntry[], languages: readonly PhoneticLanguage[], options?: Partial<PhoneticMatchOptions>) {
  const { threshold, guessedThreshold, limit } = merge(defaultOptions, options)
  const plans = languages.map(language => ({
    language,
    targets: entries.flatMap(entry => entry.pronunciations.flatMap((tokens) => {
      const windows = language.windows(tokens)
      // Recognizers often change letter case, for example `sulfur cube` for `Sulfur Cube`, so the written check ignores it.
      return windows ? [{ entry, tokens, windows, forms: entry.writtenForms.map(form => form.toLowerCase()) }] : []
    })),
  })).filter(plan => plan.targets.length)

  return (text: string): PhoneticCandidate[] => {
    const found: PhoneticCandidate[] = []
    for (const { language, targets } of plans) {
      for (const run of language.units(text)) {
        for (const target of targets) {
          for (let size = target.windows.min; size <= target.windows.max; size++) {
            for (let first = 0; first + size <= run.length; first++) {
              const window = run.slice(first, first + size)
              const start = window[0].start
              const end = window.at(-1)!.end
              const span = text.slice(start, end)
              const folded = span.toLowerCase()
              if (target.forms.some(form => folded.includes(form)))
                continue
              const score = similarity(window.flatMap(unit => unit.tokens), target.tokens, language)
              if (score < (window.some(unit => unit.guessed) ? guessedThreshold : threshold))
                continue
              const { term, description, source, writtenForms } = target.entry
              found.push({ span, candidate: writtenForms[0] ?? term, term, score: Math.round(score * 100) / 100, source, description, start, end })
            }
          }
        }
      }
    }

    return budgetCandidates(found.sort((a, b) => b.score - a.score), limit)
  }
}

/** The most readings of one stretch of the transcript, so one strong cluster cannot fill the candidate list. */
const READINGS_PER_SPAN = 4

/**
 * Keeps the strongest candidates up to `limit`, in score order.
 *
 * A term keeps only its best window in one stretch of the transcript, because its other windows are the same reading.
 * A stretch keeps at most {@link READINGS_PER_SPAN} different terms, so the other stretches still reach the limit.
 */
function budgetCandidates(sorted: readonly PhoneticCandidate[], limit: number) {
  const kept: PhoneticCandidate[] = []
  for (const candidate of sorted) {
    if (kept.length >= limit)
      break
    const overlapping = kept.filter(other => candidate.start < other.end && other.start < candidate.end)
    if (overlapping.length >= READINGS_PER_SPAN || overlapping.some(other => other.term === candidate.term))
      continue
    kept.push(candidate)
  }
  return kept
}

/**
 * Chooses the suggestions that the conversation model reads, in the order of `candidates`.
 *
 * The first candidate claims its span. A later candidate for the same audio is another reading, not another term,
 * so it is dropped. The conversation model reads every suggestion, so a long list costs attention.
 */
export function selectSuggestions(candidates: readonly PhoneticCandidate[], limit = 3): PhoneticSuggestion[] {
  const chosen: PhoneticCandidate[] = []
  for (const candidate of candidates) {
    if (chosen.length >= limit)
      break
    if (chosen.some(other => candidate.start < other.end && other.start < candidate.end))
      continue
    chosen.push(candidate)
  }
  return chosen.map(({ start: _start, end: _end, ...suggestion }) => suggestion)
}
