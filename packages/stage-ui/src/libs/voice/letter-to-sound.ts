/**
 * Spelling rules, tried in order at each letter. Each rule matches at the current position, and its lookarounds
 * read the neighboring letters. Longer and more specific spellings come first, so `ation` wins over `a`.
 * Vowel phones carry no stress digit here. {@link guessPhones} adds them.
 */
const rules: readonly (readonly [RegExp, readonly string[] | null])[] = [
  [/ation/y, ['EY', 'SH', 'AH', 'N']],
  [/[ts]ion/y, ['SH', 'AH', 'N']],
  [/[ct]ious/y, ['SH', 'AH', 'S']],
  [/ture/y, ['CH', 'ER']],
  [/ous/y, ['AH', 'S']],
  [/(?<=[^aeiou])le$/y, ['AH', 'L']],
  [/ph/y, ['F']],
  [/sh/y, ['SH']],
  [/ch/y, ['CH']],
  [/th/y, ['TH']],
  [/wh/y, ['W']],
  [/ck/y, ['K']],
  [/ng/y, ['NG']],
  [/qu/y, ['K', 'W']],
  [/q/y, ['K']],
  [/gh/y, []],
  [/^kn/y, ['N']],
  [/e[ea]/y, ['IY']],
  [/oo/y, ['UW']],
  [/a[iy]/y, ['EY']],
  [/oa/y, ['OW']],
  [/ou/y, ['AW']],
  [/ow/y, ['OW']],
  [/o[iy]/y, ['OY']],
  [/a[uw]/y, ['AO']],
  [/ie/y, ['IY']],
  [/ei/y, ['EY']],
  [/(?:ue|ew)/y, ['UW']],
  [/[eiu]r(?![aeiouy])/y, ['ER']],
  [/ar(?![aeiouy])/y, ['AA', 'R']],
  [/or(?![aeiouy])/y, ['AO', 'R']],
  // A vowel before one consonant and a final silent `e` says its name, for example `cube` and `mine`.
  [/a(?=[^aeiou]e$)/y, ['EY']],
  [/e(?=[^aeiou]e$)/y, ['IY']],
  [/i(?=[^aeiou]e$)/y, ['AY']],
  [/o(?=[^aeiou]e$)/y, ['OW']],
  [/u(?=[^aeiou]e$)/y, ['UW']],
  [/(?<=..)e$/y, []],
  [/^y|y(?=[aeiou])/y, ['Y']],
  [/y$/y, ['IY']],
  [/y/y, ['IH']],
  [/c(?=[eiy])/y, ['S']],
  [/g(?=[eiy])/y, ['JH']],
  [/(?<=[aeiou])s(?=[aeiouy])/y, ['Z']],
  [/x/y, ['K', 'S']],
  [/a/y, ['AE']],
  [/e/y, ['EH']],
  [/i/y, ['IH']],
  [/o/y, ['AA']],
  [/u/y, ['AH']],
  [/c/y, ['K']],
  [/h/y, ['HH']],
  [/j/y, ['JH']],
  // A plain consonant letter is its own phone, for example `b` is `B`.
  [/[bdfgk-nprstvwz]/y, null],
]

const VOWEL_PHONES = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'])

/**
 * Guesses ARPAbet phones from the spelling of a word that the pronouncing dictionary does not have.
 *
 * Speech recognizers write such a word when they cannot place the sound, for example `resilation` for
 * `reconciliation`. The guess is rough, but fuzzy matching needs only the general shape of the sound.
 * The first vowel gets primary stress and the others get none, because English stress needs a dictionary.
 *
 * @example
 * guessPhones('resilation')
 * // => ['R', 'EH1', 'Z', 'IH0', 'L', 'EY0', 'SH', 'AH0', 'N']
 */
export function guessPhones(word: string): string[] {
  // A doubled consonant sounds once, for example `ll` in `called`.
  const letters = word.toLowerCase().replace(/[^a-z]/g, '').replace(/([b-df-hj-np-tv-z])\1/g, '$1')
  const phones: string[] = []
  let position = 0
  while (position < letters.length) {
    const rule = rules.find(([pattern]) => {
      pattern.lastIndex = position
      return pattern.test(letters)
    })
    const [pattern, output] = rule!
    pattern.lastIndex = position
    const length = pattern.exec(letters)![0].length
    phones.push(...(output ?? [letters[position].toUpperCase()]))
    position += length
  }

  let stressed = false
  return phones.map((phone) => {
    if (!VOWEL_PHONES.has(phone))
      return phone
    const stress = stressed ? '0' : '1'
    stressed = true
    return `${phone}${stress}`
  })
}
