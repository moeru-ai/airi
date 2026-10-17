/**
 * Fixed-point operator for self-reference stability
 *
 * T(s) = let the character re-describe itself given current self-description s
 * A stable identity has a fixed point: T(s*) = s*
 */

export interface FixedPointResult {
  /** Iteration sequence of self-descriptions */
  iterations: string[]
  /** Residual at each iteration (normalized edit distance) */
  residuals: number[]
  /** Whether converged (residual < threshold) */
  converged: boolean
  /** Final residual value */
  finalResidual: number
  /** Final fixed point (last iteration) */
  fixedPoint: string
}

export interface FixedPointConfig {
  /** Initial persona description */
  initialDescription: string
  /** Model inference function */
  infer: (prompt: string) => Promise<string>
  /** Maximum iterations */
  maxIterations?: number
  /** Convergence threshold */
  convergenceThreshold?: number
}

/**
 * Compute fixed point of self-reference operator T
 *
 * Iterates: s_{k+1} = T(s_k) until convergence or max iterations
 */
export async function computeFixedPoint(
  config: FixedPointConfig
): Promise<FixedPointResult> {
  const {
    initialDescription,
    infer,
    maxIterations = 10,
    convergenceThreshold = 0.05
  } = config

  // Guard the loop bounds: 0 would skip inference and leave finalResidual
  // undefined, Infinity would never terminate, and a fractional count would
  // silently round up.
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error('maxIterations must be a positive integer')
  }
  // Normalized distance is in [0,1]. A threshold above 1 makes everything
  // converge after one inference, even for completely different descriptions.
  if (!Number.isFinite(convergenceThreshold)
      || convergenceThreshold <= 0
      || convergenceThreshold > 1) {
    throw new Error('convergenceThreshold must be a finite number in (0, 1]')
  }

  const iterations: string[] = [initialDescription]
  const residuals: number[] = []

  for (let i = 0; i < maxIterations; i++) {
    const currentDesc = iterations[iterations.length - 1]

    const prompt = `You are a digital character. Here is your current self-description:

"${currentDesc}"

Now, re-describe yourself in one paragraph (under 100 words), including:
- Your core values
- Your personality traits
- Key experiences you remember

Output only the description, nothing else.`

    const nextDesc = await infer(prompt)
    iterations.push(nextDesc)

    // Residual = order-sensitive normalized token edit distance
    const residual = normalizedTextDistance(currentDesc, nextDesc)
    residuals.push(residual)

    if (residual < convergenceThreshold) {
      return {
        iterations,
        residuals,
        converged: true,
        finalResidual: residual,
        fixedPoint: nextDesc
      }
    }
  }

  return {
    iterations,
    residuals,
    converged: false,
    finalResidual: residuals[residuals.length - 1],
    fixedPoint: iterations[iterations.length - 1]
  }
}

/**
 * Order-sensitive normalized text distance.
 *
 * Character-set comparison returns zero for anagrams ("abc" vs "cba") and near
 * zero for any same-vocabulary paragraphs, which hides real drift. We tokenize
 * on words and use Damerau-Levenshtein distance (insert, delete, substitute,
 * transpose), normalized by the longer token count. This is order-sensitive
 * while tolerating small wording changes, with no external dependency.
 */
export function normalizedTextDistance(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.length === 0 && tb.length === 0) return 0
  return damerauLevenshtein(ta, tb) / Math.max(ta.length, tb.length)
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase()
  const wordTokens = lower.match(/[\p{L}\p{N}]+/gu) ?? []
  // Space-delimited scripts make `私は猫です` a single word token, so a
  // one-character edit returns distance 1 and stable personas fail to
  // converge. When a word token is a single unsegmented CJK run, split it
  // into individual grapheme clusters. Latin and other space-separated word
  // tokens stay intact.
  const tokens: string[] = []
  const isCjk = (ch: string) =>
    /[㐀-䶿一-鿿぀-ゟ゠-ヿ가-힯豈-﫿＀-￯]/u.test(ch)
  for (const word of wordTokens) {
    const graphemes = [...word]
    if (graphemes.length > 1 && graphemes.every(isCjk)) {
      for (const g of graphemes) tokens.push(g)
    } else {
      tokens.push(word)
    }
  }
  return tokens
}

function damerauLevenshtein(a: string[], b: string[]): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  // d[i][j] = distance between a[0..i) and b[0..j)
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      )
      // transposition of adjacent tokens
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[m][n]
}

/**
 * Distance between two fixed points (for cross-session comparison)
 */
export function fixedPointDistance(fp1: string, fp2: string): number {
  return normalizedTextDistance(fp1, fp2)
}
