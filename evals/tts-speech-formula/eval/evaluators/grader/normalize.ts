const greekNames = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'])

/**
 * Rewrites that make two spellings of one notation compare equal. Order matters: a later rule sees the output of the earlier ones.
 * Set braces become sentinels first, so that a natural closing `}}` is never read as an escaped brace.
 */
const aliases: readonly (readonly [RegExp, string])[] = [
  [/\\dfrac|\\tfrac/g, String.raw`\frac`],
  [/\\leqslant|\\leqq|\\le(?![a-z])/g, String.raw`\leq`],
  [/\\geqslant|\\geqq|\\ge(?![a-z])/g, String.raw`\geq`],
  [/\\ne(?![a-z])|\\not=/g, String.raw`\neq`],
  [/\\rightarrow|\\longrightarrow|\\to(?![a-z])/g, String.raw`\to`],
  [/\\emptyset|\\varnothing|\\O(?![a-zA-Z])/g, String.raw`\emptyset`],
  [/\\dots|\\ldots|\\cdots|\.\.\.|…/g, String.raw`\cdots`],
  [/\\times/g, String.raw`\cdot`],
  [/\\ast|\*/g, String.raw`\cdot`],
  [/\\colon/g, ':'],
  [/\\vert|\\mid|\\lvert|\\rvert/g, '|'],
  [/\\varepsilon/g, String.raw`\epsilon`],
  [/\\varphi/g, String.raw`\phi`],
  [/\\degree|°|\\textdegree/g, String.raw`^\circ`],
  [/\\lbrace|\\\{/g, '\x01'],
  [/\\rbrace|\\\}/g, '\x02'],
  [/\\mapsto|\\longmapsto/g, String.raw`\mapsto`],
  [/\\(?:mathbf|mathbb|mathcal|mathrm|text|textrm|operatorname|mathit|boldsymbol)\s*\{([^{}]*)\}/g, ' $1 '],
  [/\\(?:mathbf|mathbb|mathcal|mathrm|text|textrm|operatorname|mathit|boldsymbol)(?![a-z])/g, ''],
  [/\\Delta(?=\s*ABC)|\\bigtriangleup/g, String.raw`\triangle`],
  [/π/g, String.raw`\pi`],
  [/∞/g, String.raw`\infty`],
  [/≤/g, String.raw`\leq`],
  [/≥/g, String.raw`\geq`],
  [/≠/g, String.raw`\neq`],
  [/≈/g, String.raw`\approx`],
  [/∈/g, String.raw`\in`],
  [/∉/g, String.raw`\notin`],
  [/⊆/g, String.raw`\subseteq`],
  [/⊥/g, String.raw`\perp`],
  [/∥/g, String.raw`\parallel`],
  [/√/g, String.raw`\sqrt`],
  [/[×·⋅]/g, String.raw`\cdot`],
  [/[−–]/g, '-'],
  [/∠/g, String.raw`\angle`],
  [/△/g, String.raw`\triangle`],
  // Japanese textbooks write a one-sided limit as `x→+0`.
  [/\\to\s*\+\s*0(?![0-9.])/g, String.raw`\to 0^+`],
  [/\\to\s*-\s*0(?![0-9.])/g, String.raw`\to 0^-`],
  [/\\%/g, '%'],
  [/\\lim\\limits/g, String.raw`\lim`],
  [/\\sum\\limits/g, String.raw`\sum`],
]

/** Commands and characters that only change spacing or size. */
const spacing = /\\left|\\right|\\bigg|\\Bigg|\\big|\\Big|\\displaystyle|\\,|\\;|\\:|\\!|\\quad|\\qquad|\\ |~|\\limits|\$/g

/**
 * Removes the wrappers around an answer: math delimiters, code fences, equation environments, and final punctuation.
 * A listener who heard raw LaTeX read aloud writes "dollar backslash triangle"; that spoken markup is not content.
 *
 * @example
 * stripWrappers('$$\\backslash triangle ABC$$.')
 * // => '\\triangle ABC'
 */
export function stripWrappers(source: string): string {
  let text = source.trim()
  text = text.replace(/\\backslash\s*(?=\\)/g, '')
  text = text.replace(/\\backslash\s*([A-Z]+)/gi, (_, word: string) => `\\${word}`)
  text = text.trim().replace(/^\\\$\s*|\s*\\\$$/g, '')
  text = text.replace(/^```(?:latex|tex)?|```$/g, '').trim()
  text = text.replace(/^\$\$?|\$\$?$/g, '').trim()
  text = text.replace(/^\\\[|\\\]$|^\\\(|\\\)$/g, '').trim()
  text = text.replace(/\\begin\{(?:equation|align)\*?\}|\\end\{(?:equation|align)\*?\}/g, '')
  return text.replace(/[.。,，]+$/, '').trim()
}

/**
 * The letters whose case a comparison keeps: `all`, or a set of small Latin letters and small Greek names. A letter
 * outside the set is folded.
 */
export type KeptCase = 'all' | ReadonlySet<string>

/**
 * Lowers the case of every letter outside a command name, except the letters in `keep`. A capital Greek command becomes
 * the small one.
 *
 * @example
 * foldLetterCase('\\Omega = E \\cdot X')
 * // => '\\omega = e \\cdot x'
 */
export function foldLetterCase(source: string, keep: ReadonlySet<string> = new Set()): string {
  const text = source.replace(/\\([A-Z][a-z]+)/g, (match, name: string) => greekNames.has(name.toLowerCase()) && !keep.has(name.toLowerCase()) ? `\\${name.toLowerCase()}` : match)
  let result = ''
  for (let index = 0; index < text.length;) {
    if (text[index] === '\\') {
      const command = /^\\(?:[A-Z]+|.)?/i.exec(text.slice(index))![0]
      result += command
      index += command.length
      continue
    }
    const char = text[index]!
    result += keep.has(char.toLowerCase()) ? char : char.toLowerCase()
    index++
  }
  return result
}

/**
 * The letters whose case must survive speech for this reference.
 *
 * Speech carries letter case only as a word, as "capital A", and a reading says it only for a letter that the formula
 * uses in both cases, for example `a \\in A` or `\\Omega \\neq \\omega`. Those letters keep their case in the
 * comparison. The other letters are folded, so `\\mathcal{L}_{FM}` read as "L sub F M" matches `l_{fm}`.
 */
export function caseSensitiveLetters(reference: string): Set<string> {
  // A calligraphic or a blackboard letter is still a letter, as `\\mathcal{U}` beside `u_t`. Upright words are names.
  const body = reference.replace(/\\(?:mathbb|mathcal)\{([^}]*)\}/g, '$1').replace(/\\(?:mathrm|text|operatorname)\{[^}]*\}/g, '')
  const commands = [...body.matchAll(/\\([A-Z]+)/gi)].map(match => match[1]!)
  const sensitive = new Set<string>()
  for (const name of commands) {
    const small = name.toLowerCase()
    if (greekNames.has(small) && commands.includes(small) && commands.includes(small[0]!.toUpperCase() + small.slice(1)))
      sensitive.add(small)
  }

  const plain = body.replace(/\\[A-Z]+/gi, ' ')
  const letters = new Set([
    // The first letter of each run, so `\\sin` and `ABC` do not count as many single letters.
    ...[...plain.matchAll(/(?<![\\A-Z])([A-Z])/gi)].map(match => match[1]!),
    // Every capital inside a run of capitals, for example each letter of `ABC`.
    ...[...body.matchAll(/[A-Z](?=[A-Z])|(?<=[A-Z])[A-Z]/g)].map(match => match[0]),
  ])
  for (const letter of letters) {
    if (letters.has(letter.toLowerCase()) && letters.has(letter.toUpperCase()))
      sensitive.add(letter.toLowerCase())
  }
  return sensitive
}

/**
 * Brings an answer to one canonical LaTeX string: aliases, no spacing, single-token braces removed, thousands separators removed.
 * One space stays after each command, so `\triangle ABC` does not become the command `\triangleABC`.
 *
 * @example
 * canonicalize('$\\left( x^{2} \\right) \\le \\dfrac 1 2$')
 * // => '(x^2)\\leq \\frac{1}{2}'
 */
export function canonicalize(source: string, keep: KeptCase = new Set()): string {
  let text = stripWrappers(source)
  for (const [pattern, replacement] of aliases)
    text = text.replace(pattern, replacement)
  text = text.replace(spacing, ' ')
  text = text.replace(/\\infty/g, String.raw`\infty `)
  text = text.replaceAll('\x01', '\\{').replaceAll('\x02', '\\}')
  // Three passes unwrap nested single tokens, for example `x^{{2}}`. MathBridge writes its references with a space
  // after each token, as in `\lambda_ { u }`, so a space can come between the script mark and its brace.
  for (let pass = 0; pass < 3; pass++)
    text = text.replace(/([\^_])\s*\{\s*([A-Z0-9+-]|\\[A-Z]+)\s*\}/gi, '$1$2')
  text = text.replace(/\\frac\s*([0-9A-Z])\s*([0-9A-Z])/gi, String.raw`\frac{$1}{$2}`)
  text = text.replace(/\\sqrt\s*([0-9A-Z])(?![A-Z])/gi, String.raw`\sqrt{$1}`)
  text = text.replace(/\^\\circ\s*/g, String.raw`^\circ `)
  text = text.replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
  // A distribution on an interval is written `U[0,1]` or `U([0,1])`: parentheses around one bracketed interval add nothing.
  text = text.replace(/\(\s*(\[[^()[\]]*[\])])\s*\)/g, '$1')
  text = text.replace(/(\\[A-Z]+)\s*/gi, '$1\x00')
  text = text.replace(/\s+/g, '').replaceAll('\x00', ' ')
  return keep === 'all' ? text : foldLetterCase(text, keep)
}
