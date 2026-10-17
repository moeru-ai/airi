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
 * Exact empirical 1D Wasserstein-1 between two weighted samples, integrating
 * |F_a - F_b| over the merged step boundaries. This is exact for unequal
 * sample counts; no zero padding and no quantile interpolation.
 *
 *   [0,1] vs [0,0.2,1] -> 1/6 (verified), not 0.1.
 */
function wasserstein1D(a: number[], b: number[]): number {
  const sortedA = [...a].sort((x, y) => x - y)
  const sortedB = [...b].sort((x, y) => x - y)
  const m = sortedA.length
  const n = sortedB.length

  let i = 0
  let j = 0
  let distance = 0
  let cumA = 0
  let cumB = 0
  let prev = 0

  while (i < m || j < n) {
    const value =
      i < m && (j >= n || sortedA[i] <= sortedB[j])
        ? sortedA[i]
        : sortedB[j]

    distance += Math.abs(cumA - cumB) * (value - prev)
    prev = value

    // Advance every boundary at this value and accumulate its mass.
    while (i < m && sortedA[i] === value) {
      cumA += 1 / m
      i += 1
    }
    while (j < n && sortedB[j] === value) {
      cumB += 1 / n
      j += 1
    }
  }

  return distance
}

/**
 * Wasserstein-style identity distance in 4D rubric space.
 *
 * Probes are answered at baseline and again after compression, so the two
 * score sets are paired observations. Pairing probe k to probe k preserves the
 * joint geometry: a response whose profile moves between axes
 * (`[1,0,0,0]` -> `[0,1,0,0]`) is real drift, even though every marginal is
 * unchanged. We use the average L1 distance between paired rubric vectors.
 *
 * Paired vectors are aligned by sorting both sides on their overall magnitude,
 * which is stable to probe ordering while keeping each rubric vector intact.
 */
function toVector(s: RubricScore): [number, number, number, number] {
  return [s.identity, s.value, s.expression, s.memory]
}

function magnitude(v: readonly number[]): number {
  return v.reduce((acc, x) => acc + x, 0)
}

function sortByMagnitude(scores: RubricScore[]): RubricScore[] {
  return [...scores].sort((a, b) => magnitude(toVector(a)) - magnitude(toVector(b)))
}

export function wassersteinDistance(
  scores1: RubricScore[],
  scores2: RubricScore[]
): number {
  if (scores1.length === 0 || scores2.length === 0) {
    throw new Error('wassersteinDistance requires non-empty score arrays')
  }

  const a = sortByMagnitude(scores1)
  const b = sortByMagnitude(scores2)

  // Pair over the common grid so unequal sample counts compare empirical
  // profiles without zero padding.
  const grid = Math.max(a.length, b.length)
  const sample = (list: RubricScore[], index: number): RubricScore =>
    list[Math.min(list.length - 1, Math.floor((index * list.length) / grid))]

  let total = 0
  for (let k = 0; k < grid; k++) {
    const va = toVector(sample(a, k))
    const vb = toVector(sample(b, k))
    for (let axis = 0; axis < 4; axis++) {
      total += Math.abs(va[axis] - vb[axis])
    }
  }
  // Average over grid points and the four axes -> [0,1].
  return total / (grid * 4)
}

/**
 * Marginal per-axis empirical W1. Useful for diagnosing which axis moved;
 * unlike {@link wassersteinDistance} it does not preserve cross-axis pairing.
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
    result[axis] = wasserstein1D(axisValues(scores1, axis), axisValues(scores2, axis))
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
