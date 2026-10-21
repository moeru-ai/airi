/**
 * Characters that a TTS voice cannot read as words. Each one leaves the reading to the TTS provider:
 * some read `$5` and `m/s` well, and others skip or misread them, mostly in Japanese and Korean.
 */
const notationCharacters = /[\\^_{}$|~/]/g

/**
 * LaTeX command names that are also words of a reading, so finding them in spoken text is not a leftover:
 * Greek letter names, and English words such as `times` in "3 times 10" or `right` in "right arrow".
 */
const spokenCommandNames = new Set([
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'omicron',
  'sigma',
  'upsilon',
  'omega',
  'nabla',
  'angle',
  'left',
  'right',
  'over',
  'parallel',
  'partial',
  'prime',
  'star',
  'dagger',
  'subset',
  'supset',
  'tilde',
  'times',
  'triangle',
])

/**
 * Finds the notation that a test object left in its spoken text, so a TTS voice gets symbols instead of words.
 *
 * It finds two kinds: a character that has no reading, such as `^`, `/`, or `$`, and a LaTeX command name of the input
 * that came through as a word, such as `mapsto`. It runs on text only, so it shows these defects without TTS or ASR.
 * Command names shorter than four letters are not checked, because many of them are also words, for example `in`.
 *
 * @example
 * leftoverNotation('9.8 m/s^2', '$9.8\\,\\mathrm{m/s^2}$')
 * // => ['/', '^']
 * leftoverNotation('f X approaches Y x mapsto y', '$f: X \\to Y, x \\mapsto y$')
 * // => ['mapsto']
 */
export function leftoverNotation(spoken: string, markdown: string): string[] {
  const leftovers = Array.from(spoken.matchAll(notationCharacters), match => match[0])
  const commandNames = new Set(Array.from(markdown.matchAll(/\\([a-z]+)/gi), match => match[1]!))
  for (const name of commandNames) {
    if (name.length < 4 || spokenCommandNames.has(name.toLowerCase()))
      continue
    // `\b` is an ASCII word boundary, so a name next to CJK text, for example `mapsto是`, still matches.
    if (new RegExp(`\\b${name}\\b`, 'i').test(spoken))
      leftovers.push(name)
  }
  return leftovers
}
