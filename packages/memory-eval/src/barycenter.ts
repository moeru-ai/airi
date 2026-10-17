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
  if (scores.length === 0) {
    throw new Error('computeBarycenter requires at least one score')
  }
  validateScores(scores)

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

  // A distribution with no positive mass has no defined center; dividing by
  // zero here would return four NaNs that propagate to centroidProfileDistance.
  if (!(totalWeight > 0)) {
    throw new Error('computeBarycenter requires at least one positive-weight score')
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

/**
 * Exact weighted empirical 1D Wasserstein-1 between two weighted samples,
 * integrating |F_a - F_b| over the merged step boundaries. Exact for unequal
 * sample counts and unequal weights; no zero padding, no quantile
 * interpolation, and invariant to the order of observations.
 *
 *   values [0,1] (equal weight) vs [0,0.2,1] -> 1/6 (verified).
 */
function weightedWasserstein1D(
  a: number[],
  weightA: number[],
  b: number[],
  weightB: number[]
): number {
  const totalA = weightA.reduce((acc, w) => acc + w, 0)
  const totalB = weightB.reduce((acc, w) => acc + w, 0)
  if (totalA <= 0 || totalB <= 0) {
    throw new Error('weightedWasserstein1D requires positive total weight')
  }

  const order = (vals: number[], weights: number[]) =>
    vals
      .map((value, index) => ({ value, weight: weights[index] }))
      .sort((x, y) => x.value - y.value)

  const sa = order(a, weightA)
  const sb = order(b, weightB)
  const m = sa.length
  const n = sb.length

  let i = 0
  let j = 0
  let distance = 0
  let cumA = 0
  let cumB = 0
  let prev = 0

  while (i < m || j < n) {
    const value =
      i < m && (j >= n || sa[i].value <= sb[j].value)
        ? sa[i].value
        : sb[j].value

    distance += Math.abs(cumA / totalA - cumB / totalB) * (value - prev)
    prev = value

    while (i < m && sa[i].value === value) {
      cumA += sa[i].weight
      i += 1
    }
    while (j < n && sb[j].value === value) {
      cumB += sb[j].weight
      j += 1
    }
  }

  return distance
}

/**
 * Weighted Wasserstein-1 identity distance in 4D rubric space.
 *
 * The four rubric axes are not interchangeable. We compute the exact weighted
 * empirical 1D W1 per axis over the marginal score distributions and average
 * across axes. Order statistics make the result invariant to observation
 * order: reordering either side (including magnitude ties) never changes it,
 * because W1 compares empirical distributions, not row pairs.
 *
 * Per-score `weight` is honoured as transport mass. Zero-weight observations
 * contribute no mass. Use {@link centroidProfileDistance} if you instead need
 * a metric sensitive to cross-axis pairing of individual responses.
 */
function weightOf(s: RubricScore): number {
  return s.weight ?? 1
}

/**
 * Validate public score inputs up front. A NaN axis never satisfies the merge
 * comparisons in weighted W1 (NaN !== NaN), which would loop forever; a bad
 * weight poisons the transport mass. Throw instead.
 */
function validateScores(scores: RubricScore[]): void {
  for (const score of scores) {
    for (const axis of RUBRIC_AXES) {
      if (!Number.isFinite(score[axis])) {
        throw new Error(`RubricScore.${axis} must be a finite number`)
      }
    }
    const weight = weightOf(score)
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error('RubricScore.weight must be a finite non-negative number')
    }
  }
}

export function wassersteinDistance(
  scores1: RubricScore[],
  scores2: RubricScore[]
): number {
  if (scores1.length === 0 || scores2.length === 0) {
    throw new Error('wassersteinDistance requires non-empty score arrays')
  }
  validateScores(scores1)
  validateScores(scores2)
  if (scores1.every(s => weightOf(s) === 0)
      || scores2.every(s => weightOf(s) === 0)) {
    throw new Error('wassersteinDistance requires positive total weight on both sides')
  }

  const weights1 = scores1.map(weightOf)
  const weights2 = scores2.map(weightOf)

  let total = 0
  for (const axis of RUBRIC_AXES) {
    total += weightedWasserstein1D(
      scores1.map(s => s[axis]),
      weights1,
      scores2.map(s => s[axis]),
      weights2
    )
  }
  return total / RUBRIC_AXES.length
}

/**
 * Weighted L1 distance between the two rubric barycenters. Unlike
 * {@link wassersteinDistance} this preserves joint geometry: a response whose
 * profile moves between axes (`[1,0,0,0]` -> `[0,1,0,0]`) changes the centroid
 * profile. It does not detect within-axis spread changes.
 */
export function centroidProfileDistance(
  scores1: RubricScore[],
  scores2: RubricScore[]
): number {
  const bary1 = computeBarycenter(scores1).centroid
  const bary2 = computeBarycenter(scores2).centroid
  let total = 0
  for (let axis = 0; axis < 4; axis++) {
    total += Math.abs(bary1[axis] - bary2[axis])
  }
  return total / 4
}

/**
 * Marginal per-axis empirical W1 (unweighted convenience diagnostic).
 * Retained for callers that want the per-axis breakdown.
 */
export function marginalW1ByAxis(
  scores1: RubricScore[],
  scores2: RubricScore[]
): Record<RubricAxis, number> {
  if (scores1.length === 0 || scores2.length === 0) {
    throw new Error('marginalW1ByAxis requires non-empty score arrays')
  }
  const result = {} as Record<RubricAxis, number>
  for (const axis of RUBRIC_AXES) {
    result[axis] = weightedWasserstein1D(
      scores1.map(s => s[axis]),
      scores1.map(weightOf),
      scores2.map(s => s[axis]),
      scores2.map(weightOf)
    )
  }
  return result
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
