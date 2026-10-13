import type { PhoneticLanguage, PhoneticUnit } from './phonetic-match'

import { pinyin } from 'pinyin-pro'

/**
 * Substitution costs between pinyin tokens.
 *
 * ASR keeps the vowel shape of a syllable more often than its tone, so a tone change costs little.
 * The groups list pairs that Mandarin speakers and ASR models often merge, for example `l` and `n`, or `an` and `ang`.
 * Any other substitution costs 1.
 */
const TONE_COST = 0.1
const CONFUSABLE_COST = 0.5
const confusableGroups = [['l', 'n', 'r'], ['f', 'h'], ['z', 'zh'], ['c', 'ch'], ['s', 'sh'], ['an', 'ang'], ['en', 'eng'], ['in', 'ing'], ['ian', 'iang'], ['uan', 'uang']]
const confusableGroup = new Map(confusableGroups.flatMap((group, index) => group.map(token => [token, index] as const)))

/**
 * Removes tone marks and the `ü` diaeresis.
 * Pinyin libraries and the model vocabulary disagree on `ü` after `j`, `q`, `x`, and `y`, so the diaeresis is not a distinction here.
 *
 * @example
 * toneless('ǘ') // => 'u'
 */
function toneless(token: string) {
  return token.normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * Splits text into runs of Chinese syllables, each as a pinyin initial and a toned final.
 * Any other character ends a run, so a match never crosses punctuation or another script.
 */
function syllableRuns(text: string): PhoneticUnit[][] {
  const runs: PhoneticUnit[][] = []
  let run: PhoneticUnit[] = []
  let offset = 0
  for (const item of pinyin(text, { type: 'all', toneType: 'symbol' })) {
    const start = offset
    offset += item.origin.length
    if (!item.isZh || !item.final) {
      if (run.length)
        runs.push(run)
      run = []
      continue
    }
    run.push({ tokens: item.initial ? [item.initial, item.final] : [item.final], start, end: offset })
  }
  if (run.length)
    runs.push(run)
  return runs
}

/**
 * Mandarin in the wake word model tokens: a pinyin initial and a toned final for each syllable.
 * A pronunciation with ARPAbet phones, which are upper case, belongs to English, so this language skips it.
 */
export const mandarin: PhoneticLanguage = {
  units: syllableRuns,
  windows: (tokens) => {
    if (tokens.some(token => token !== token.toLowerCase()))
      return undefined
    // A window covers one syllable less to one syllable more than the pronunciation. A single syllable sounds like
    // too many words, so it never matches.
    const syllables = tokens.filter(token => /[aeiou]/.test(toneless(token))).length
    return syllables >= 2 ? { min: syllables - 1, max: syllables + 1 } : undefined
  },
  substitutionCost: (a, b) => {
    if (a === b)
      return 0
    const baseA = toneless(a)
    const baseB = toneless(b)
    if (baseA === baseB)
      return TONE_COST
    const group = confusableGroup.get(baseA)
    return group !== undefined && group === confusableGroup.get(baseB) ? CONFUSABLE_COST : 1
  },
}

/**
 * Converts Chinese text to model tokens. Vocabulary packs use it when an entry has only written forms.
 *
 * @example
 * pronounceChinese('硫方怪')
 * // => ['l', 'iú', 'f', 'āng', 'g', 'uài']
 * pronounceChinese('Sulfur Cube')
 * // => undefined
 */
export function pronounceChinese(text: string): string[] | undefined {
  const runs = syllableRuns(text)
  if (runs.length !== 1 || runs[0].length !== [...text].length)
    return undefined
  return runs[0].flatMap(syllable => syllable.tokens)
}
