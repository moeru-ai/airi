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

    // Residual = normalized set-symmetric-difference (simple proxy for edit distance)
    const residual = normalizedEditDistance(currentDesc, nextDesc)
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
 * Normalized edit distance (simplified: character set difference)
 */
function normalizedEditDistance(a: string, b: string): number {
  const setA = new Set(a)
  const setB = new Set(b)

  const symmetric = new Set([...setA].filter(x => !setB.has(x)))
  for (const x of setB) {
    if (!setA.has(x)) symmetric.add(x)
  }

  return symmetric.size / Math.max(a.length, b.length)
}

/**
 * Distance between two fixed points (for cross-session comparison)
 */
export function fixedPointDistance(fp1: string, fp2: string): number {
  return normalizedEditDistance(fp1, fp2)
}
