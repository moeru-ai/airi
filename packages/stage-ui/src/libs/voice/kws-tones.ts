/** Mandarin tone marks after NFD. The diaeresis of `ü` is not a tone, so it stays. */
const TONE_MARKS = /[\u0300\u0301\u0304\u030C]/gu

/** Only a final carries a tone. Initials and syllabic nasals such as `ń` have no vowel, so they get no alternatives. */
const VOWEL = /[aeiouü]/

function toneless(token: string) {
  return token.normalize('NFD').replace(TONE_MARKS, '').normalize('NFC')
}

/**
 * Creates the tone variant generator for a pinyin keyword vocabulary.
 *
 * People change the tone of a name when they call it. For example, the last syllable rises in a question, and
 * `一` changes tone before other syllables. A keyword model with toned finals treats each tone as another token,
 * so one stored pronunciation misses these calls. Each variant changes the tone of one final. The number of
 * variants grows linearly with the syllable count, not exponentially.
 *
 * English phone tokens are upper case, so they never match a pinyin final and get no variants.
 *
 * @example
 * const variants = createToneVariants(new Set(['h', 'ēi', 'èi', 'l', 'ū', 'ú', 'ù']))
 * variants(['h', 'ēi', 'l', 'ū'])
 * // => [['h', 'èi', 'l', 'ū'], ['h', 'ēi', 'l', 'ú'], ['h', 'ēi', 'l', 'ù']]
 */
export function createToneVariants(vocabulary: ReadonlySet<string>) {
  const finals = new Map<string, string[]>()
  for (const token of vocabulary) {
    const base = toneless(token)
    if (token !== token.toLowerCase() || !VOWEL.test(base))
      continue
    const group = finals.get(base) ?? []
    group.push(token)
    finals.set(base, group)
  }

  return (tokens: readonly string[]): string[][] => tokens.flatMap((token, index) => {
    const group = VOWEL.test(toneless(token)) ? finals.get(toneless(token)) : undefined
    return (group ?? []).filter(alternative => alternative !== token).map(alternative => tokens.with(index, alternative))
  })
}
