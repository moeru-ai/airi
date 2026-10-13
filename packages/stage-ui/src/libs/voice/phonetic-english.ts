import type { PhoneticLanguage, PhoneticUnit } from './phonetic-match'

import { dictionary } from 'cmu-pronouncing-dictionary'

import { guessPhones } from './letter-to-sound'

/**
 * Substitution costs between ARPAbet phones.
 *
 * A stress change costs little, because ASR and the dictionary often disagree on secondary stress.
 * The groups list phones that ASR models often merge: voicing pairs such as `P` and `B`, nasals, liquids, and
 * neighboring vowels. Any other substitution costs 1.
 */
const STRESS_COST = 0.1
const CONFUSABLE_COST = 0.5
/**
 * Fast speech drops unstressed vowels and reduces them to a schwa, for example `reconciliation` heard as `resilation`.
 * So a dropped unstressed vowel costs less than a dropped consonant, and two unstressed vowels are confusable.
 */
const UNSTRESSED_DROP_COST = 0.4
const confusableGroups = [['P', 'B'], ['T', 'D'], ['K', 'G'], ['F', 'V'], ['S', 'Z'], ['TH', 'DH'], ['SH', 'ZH'], ['CH', 'JH'], ['M', 'N', 'NG'], ['L', 'R'], ['AA', 'AO', 'AH'], ['AE', 'EH'], ['IH', 'IY'], ['UH', 'UW'], ['EY', 'EH'], ['OW', 'AO']]
/** A phone can belong to two groups, for example `EH`, so the lookup keeps phone pairs, not group indexes. */
const confusablePairs = new Set(confusableGroups.flatMap(group => group.flatMap(a => group.map(b => `${a} ${b}`))))

/**
 * Removes the stress digit of an ARPAbet vowel.
 *
 * @example
 * stressless('AY1') // => 'AY'
 */
function stressless(phone: string) {
  return phone.replace(/\d$/, '')
}

/** A word with letters and inner apostrophes, for example `don't`. Digits and other scripts end a run. */
const WORD = /[a-z]+(?:'[a-z]+)*/gi

/** Returns the first dictionary pronunciation of a word. Variants such as `read(2)` are other readings, not needed here. */
function lookup(word: string): string[] | undefined {
  return dictionary[word.toLowerCase()]?.split(' ')
}

/**
 * Splits text into runs of English words, each as ARPAbet phones from the CMU pronouncing dictionary.
 * A word outside the dictionary gets phones guessed from its spelling, and the unit is marked as guessed.
 *
 * Only spaces join two words into one run. Punctuation and other scripts end a run.
 */
function wordRuns(text: string): PhoneticUnit[][] {
  const runs: PhoneticUnit[][] = []
  let run: PhoneticUnit[] = []
  let previousEnd = 0
  for (const match of text.matchAll(WORD)) {
    const start = match.index
    const end = start + match[0].length
    if (run.length && !/^ +$/.test(text.slice(previousEnd, start))) {
      runs.push(run)
      run = []
    }
    const tokens = lookup(match[0])
    run.push(tokens ? { tokens, start, end } : { tokens: guessPhones(match[0]), start, end, guessed: true })
    previousEnd = end
  }
  if (run.length)
    runs.push(run)
  return runs
}

/**
 * English in the wake word model tokens: ARPAbet phones with stress digits, as in the CMU pronouncing dictionary.
 * A pronunciation with pinyin tokens, which are lower case, belongs to Mandarin, so this language skips it.
 */
export const english: PhoneticLanguage = {
  units: wordRuns,
  windows: (tokens) => {
    if (tokens.some(token => token !== token.toUpperCase()))
      return undefined
    // A unit is a word. A misheard term often splits into more words, for example `Zustand` as `zoo stand`,
    // so the window grows from one word to one more than the syllables. A single syllable never matches.
    const syllables = tokens.filter(token => /\d$/.test(token)).length
    return syllables >= 2 ? { min: 1, max: syllables + 1 } : undefined
  },
  substitutionCost: (a, b) => {
    if (a === b)
      return 0
    const baseA = stressless(a)
    const baseB = stressless(b)
    if (baseA === baseB)
      return STRESS_COST
    if (confusablePairs.has(`${baseA} ${baseB}`))
      return CONFUSABLE_COST
    return a.endsWith('0') && b.endsWith('0') ? CONFUSABLE_COST : 1
  },
  dropCost: expected => expected.endsWith('0') ? UNSTRESSED_DROP_COST : 1,
}

/**
 * Converts English text to model tokens. Vocabulary packs use it when an entry has only written forms.
 * A word outside the dictionary gets phones guessed from its spelling. A pack can give exact phones for such a term.
 * Returns `undefined` when the text has characters other than English words, spaces, and hyphens.
 *
 * @example
 * pronounceEnglish('Sulfur Cube')
 * // => ['S', 'AH1', 'L', 'F', 'ER0', 'K', 'Y', 'UW1', 'B']
 * pronounceEnglish('Zustand')
 * // => ['Z', 'AH1', 'S', 'T', 'AE0', 'N', 'D']
 */
export function pronounceEnglish(text: string): string[] | undefined {
  const words = text.match(WORD)
  if (!words || words.join('').length !== text.replace(/[\s-]/g, '').length)
    return undefined
  return words.flatMap(word => lookup(word) ?? guessPhones(word))
}
