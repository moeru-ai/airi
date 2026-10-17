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
 * Wasserstein-1 distance in 4D rubric space
 *
 * The four rubric axes are not interchangeable. We compute the 1D empirical
 * W1 distance per axis (sort each axis, pair the order statistics, average the
 * absolute gaps) and average across axes. Comparing order statistics works for
 * unequal sample counts without inventing zero-filled observations.
 *
 * For each axis, with samples a (length m) and b (length n):
 *   W1_axis = (1/(mn)) * sum_i sum_j |quantile_a(i) - quantile_b(j)|
 * is exact for the empirical CDF; here we use the equivalent O(m+n)
 * sorted-pair interpolation via weighted order statistics.
 */
const RUBRIC_AXES = ['identity', 'value', 'expression', 'memory'] as const
export type RubricAxis = (typeof RUBRIC_AXES)[number]

function axisValues(scores: RubricScore[], axis: RubricAxis): number[] {
  return scores.map(s => s[axis]).sort((x, y) => x - y)
}

/**
 * 1D Wasserstein-1 between two empirical samples, by the sorted-pair / quantile
 * definition. Handles m != n by pairing across the common [0,1] quantile grid.
 * Empty arrays are invalid for this caller (guarded upstream).
 */
function wasserstein1D(a: number[], b: number[]): number {
  const m = a.length
  const n = b.length
  if (m === n) {
    let sum = 0
    for (let i = 0; i < m; i++) sum += Math.abs(a[i] - b[i])
    return sum / m
  }

  // Different sizes: integrate |F_a - F_b| on the step grid using quantile
  // interpolation at shared fractions k/max(m,n).
  const grid = Math.max(m, n)
  const quantile = (sorted: number[], len: number, q: number) => {
    const pos = q * (len - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(len - 1, lo + 1)
    const frac = pos - lo
    return sorted[lo] * (1 - frac) + sorted[hi] * frac
  }
  let sum = 0
  for (let k = 0; k < grid; k++) {
    const q = grid === 1 ? 0 : k / (grid - 1)
    sum += Math.abs(quantile(a, m, q) - quantile(b, n, q))
  }
  return sum / grid
}

export function wassersteinDistance(
  scores1: RubricScore[],
  scores2: RubricScore[]
): number {
  if (scores1.length === 0 || scores2.length === 0) {
    throw new Error('wassersteinDistance requires non-empty score arrays')
  }

  let total = 0
  for (const axis of RUBRIC_AXES) {
    total += wasserstein1D(axisValues(scores1, axis), axisValues(scores2, axis))
  }
  return total / RUBRIC_AXES.length
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
