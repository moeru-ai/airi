/**
 * Barycenter (centroid) computation and Wasserstein-1 distance
 *
 * Response distribution μ_t in 4D rubric space → centroid G_t
 * Drift = W1(μ_0, μ_t) > threshold
 */

export interface RubricScore {
  identity: number
  value: number
  expression: number
  memory: number
  /** Optional weight (default 1.0) */
  weight?: number
}

export interface BarycenterResult {
  /** Centroid coordinates [identity, value, expression, memory] */
  centroid: [number, number, number, number]
  /** Total weight */
  totalWeight: number
}

/**
 * Compute weighted barycenter (centroid) of 4D scores
 */
export function computeBarycenter(scores: RubricScore[]): BarycenterResult {
  let sumIdentity = 0
  let sumValue = 0
  let sumExpression = 0
  let sumMemory = 0
  let totalWeight = 0

  for (const score of scores) {
    const w = score.weight ?? 1.0
    sumIdentity += score.identity * w
    sumValue += score.value * w
    sumExpression += score.expression * w
    sumMemory += score.memory * w
    totalWeight += w
  }

  return {
    centroid: [
      sumIdentity / totalWeight,
      sumValue / totalWeight,
      sumExpression / totalWeight,
      sumMemory / totalWeight
    ],
    totalWeight
  }
}

/**
 * Wasserstein-1 distance (1D approximation: flatten to 1D then compute)
 *
 * For 4D, we flatten scores and use the 1D W1 formula:
 * W1(μ, ν) = integral of |F_μ(x) - F_ν(x)| dx
 *          = sum of |sorted_μ[i] - sorted_ν[i]| (for empirical distributions)
 */
export function wassersteinDistance(
  scores1: RubricScore[],
  scores2: RubricScore[]
): number {
  // Flatten to 1D
  const flatten = (scores: RubricScore[]): number[] =>
    scores.flatMap(s => [s.identity, s.value, s.expression, s.memory])

  const flat1 = flatten(scores1).sort((a, b) => a - b)
  const flat2 = flatten(scores2).sort((a, b) => a - b)

  // Pad to same length
  const maxLen = Math.max(flat1.length, flat2.length)
  while (flat1.length < maxLen) flat1.push(0)
  while (flat2.length < maxLen) flat2.push(0)

  // W1 = sum of absolute differences
  let sum = 0
  for (let i = 0; i < maxLen; i++) {
    sum += Math.abs(flat1[i] - flat2[i])
  }

  return sum / maxLen  // Normalize
}

/**
 * Centroid migration (Euclidean distance between two barycenters)
 */
export function centroidDistance(
  centroid1: [number, number, number, number],
  centroid2: [number, number, number, number]
): number {
  let sumSq = 0
  for (let i = 0; i < 4; i++) {
    sumSq += (centroid1[i] - centroid2[i]) ** 2
  }
  return Math.sqrt(sumSq)
}
