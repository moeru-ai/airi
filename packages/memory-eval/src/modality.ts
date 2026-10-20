/**
 * Bimodality detection: GMM-BIC (1 vs 2 components)
 *
 * Tests whether response distribution splits into two distinct peaks
 * (indicating "two personalities")
 */

export interface BimodalityResult {
  /** Is bimodal (2 components preferred by BIC)? */
  bimodal: boolean
  /** BIC for k=1 */
  bic1: number
  /** BIC for k=2 */
  bic2: number
  /** BIC improvement (bic1 - bic2; positive = 2-component is better) */
  bicImprovement: number
  /**
   * Whether the modality metric was actually tested. False when there are
   * too few samples for a reliable 2-component fit, in which case `bimodal`
   * is reported as false but should not be read as evidence of a single peak.
   */
  sufficientSamples: boolean
}

/**
 * Detect bimodality using GMM-BIC
 *
 * Fits 1-component and 2-component GMMs, compares BIC
 * If BIC(k=2) < BIC(k=1) by sufficient margin, distribution is bimodal
 */
export function detectBimodality(
  data: number[][],  // Each row is 4D rubric score
  bicThreshold = 10,  // BIC improvement threshold
  seed = 42,  // Deterministic EM initialization
  sampleWeights?: number[]  // Per-row mass; zero-weight rows carry no mass
): BimodalityResult {
  // Bimodality needs at least two points: one component cannot be
  // The BIC threshold itself must be a finite positive number; NaN would
  // silently report unimodal and -Infinity would report every split.
  if (!Number.isFinite(bicThreshold) || bicThreshold <= 0) {
    throw new Error('bicThreshold must be a finite positive number')
  }

  // distinguished from another with fewer samples than components.
  if (!data || data.length < 2) {
    return { bimodal: false, bic1: 0, bic2: 0, bicImprovement: 0, sufficientSamples: false }
  }

  // Reject poisoned input: a NaN/Infinite coordinate produces NaN EM
  // responsibilities and silently meaningless BIC values from direct callers.
  const dims = data[0].length
  for (let i = 0; i < data.length; i++) {
    if (data[i].length !== dims) {
      throw new Error('detectBimodality requires every row to have the same length')
    }
    for (let dim = 0; dim < dims; dim++) {
      if (!Number.isFinite(data[i][dim])) {
        throw new Error(`detectBimodality row ${i} contains a non-finite coordinate`)
      }
    }
  }
  if (sampleWeights) {
    if (sampleWeights.length !== data.length) {
      throw new Error('sampleWeights length must match the number of rows')
    }
    for (const w of sampleWeights) {
      if (!Number.isFinite(w) || w < 0) {
        throw new Error('sampleWeights must be finite non-negative numbers')
      }
    }
  }

  // A zero-weight observation must not influence the fit, matching the W1
  // metric which already excludes it. Keep only positive-mass rows.
  let rows = data
  let weights = sampleWeights
  if (weights) {
    const keptRows: number[][] = []
    const keptWeights: number[] = []
    for (let i = 0; i < data.length; i++) {
      const w = weights[i] ?? 1
      if (Number.isFinite(w) && w > 0) {
        keptRows.push(data[i])
        keptWeights.push(w)
      }
    }
    rows = keptRows
    weights = keptWeights
    if (rows.length < 2) {
      return { bimodal: false, bic1: 0, bic2: 0, bicImprovement: 0, sufficientSamples: false }
    }
  }
  data = rows

  // Normalize weights so they sum to the row count. Relative mass (weight 100
  // vs weight 1) is preserved for the fit, but the BIC penalty stays on the
  // standard sample-size scale: tiny weights on all rows would otherwise make
  // log(totalMass) negative and reward the 17-parameter model on identical data.
  if (weights) {
    const sum = weights.reduce((acc, w) => acc + w, 0)
    const scale = sum > 0 ? data.length / sum : 1
    weights = weights.map(w => w * scale)
  }

  // A two-component diagonal GMM has 17 free parameters in 4D. With very few
  // observations each point can get its own near-zero-variance Gaussian, which
  // yields a huge BIC "improvement" that is a degenerate fit, not evidence of
  // two personas. Disable the modality signal below a minimum sample count
  // (at least 4 observations per component).
  const MIN_SAMPLES_FOR_TWO_COMPONENTS = 8
  if (data.length < MIN_SAMPLES_FOR_TWO_COMPONENTS) {
    // Surface the insufficiency so callers do not read `bimodal: false` as a
    // tested unimodal result; the split-persona metric was not evaluated.
    return {
      bimodal: false,
      bic1: 0,
      bic2: 0,
      bicImprovement: 0,
      sufficientSamples: false,
    }
  }

  // Never request more components than data points.
  const k2 = 2

  // Fit 1-component GMM
  const gmm1 = fitGMM(data, 1, seed, 50, weights)
  const bic1 = computeBIC(data, gmm1)

  // Fit 2-component GMM
  const gmm2 = fitGMM(data, k2, seed + 1, 50, weights)
  const bic2 = computeBIC(data, gmm2)

  const bicImprovement = bic1 - bic2

  return {
    bimodal: bicImprovement > bicThreshold,
    bic1,
    bic2,
    bicImprovement,
    sufficientSamples: true,
  }
}

interface GMM {
  k: number
  means: number[][]  // k × d
  covariances: number[][][]  // k × d × d (simplified: diagonal)
  weights: number[]  // k (mixture weights)
  logLikelihood: number
  totalMass: number  // sum of sample weights (effective sample count)
}

/**
 * Deterministic PRNG (mulberry32). Seeding the GMM initialization makes
 * repeated runs reproducible, so BIC cannot cross the threshold by chance.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Canonical ordering of a data row. Comparing row vectors lexicographically
 * makes the input independent of observation order, so grouping vs
 * interleaving the same points cannot change which centroid starts first.
 */
function canonicalOrder(
  data: number[][],
  weights: number[]
): { rows: number[][]; weights: number[] } {
  const indices = data.map((_, i) => i)
  indices.sort((ia, ib) => {
    const a = data[ia]
    const b = data[ib]
    for (let dim = 0; dim < a.length; dim++) {
      if (a[dim] !== b[dim]) return a[dim] - b[dim]
    }
    return ia - ib
  })
  return {
    rows: indices.map(i => data[i]),
    weights: indices.map(i => weights[i]),
  }
}

/**
 * Fit GMM using EM (diagonal covariance) with deterministic restarts.
 *
 * EM converges to a local optimum that depends on initialization. We run
 * several seeded starts and keep the fit with the highest log-likelihood,
 * which (together with canonical row ordering) makes the BIC comparison
 * invariant to both the order of observations and the single random draw.
 */
function fitGMM(
  data: number[][],
  k: number,
  seed = 42,
  maxIter = 50,
  sampleWeights?: number[]
): GMM {
  const baseWeights = sampleWeights ?? data.map(() => 1)
  const totalMass = baseWeights.reduce((acc, w) => acc + w, 0)
  const { rows, weights } = canonicalOrder(data, baseWeights)
  const restarts = k === 1 ? 1 : 5

  let best: GMM | null = null
  for (let run = 0; run < restarts; run++) {
    const candidate = fitGMMOnce(rows, k, mulberry32(seed + run * 1009), maxIter, weights, totalMass)
    if (!best || candidate.logLikelihood > best.logLikelihood) {
      best = candidate
    }
  }
  return best as GMM
}

function fitGMMOnce(
  data: number[][],
  k: number,
  rand: () => number,
  maxIter: number,
  sampleWeights: number[],
  totalMass: number
): GMM {
  const n = data.length
  const d = data[0].length

  // Initialize means (k-means++ style, seeded)
  const means = initializeMeans(data, k, rand)
  const covariances = Array(k).fill(null).map(() =>
    Array(d).fill(null).map(() => Array(d).fill(0))
  )
  const weights = Array(k).fill(1 / k)

  // Initialize diagonal covariances
  for (let j = 0; j < k; j++) {
    for (let dim = 0; dim < d; dim++) {
      covariances[j][dim][dim] = 1.0
    }
  }

  let logLikelihood = -Infinity

  // EM iterations
  for (let iter = 0; iter < maxIter; iter++) {
    // E-step: compute responsibilities
    const responsibilities = new Array(n).fill(null).map(() => new Array(k).fill(0))
    const logLikelihoods = new Array(n).fill(0)

    for (let i = 0; i < n; i++) {
      // Work in log space so a point far from every (possibly shrunken)
      // component underflows every PDF to zero without producing a 0/0 NaN
      // posterior. log-sum-exp keeps the normalization finite.
      const logWeights: number[] = []
      for (let j = 0; j < k; j++) {
        const prob = gaussianPDF(data[i], means[j], covariances[j])
        logWeights[j] = Math.log(weights[j] > 0 ? weights[j] : 1e-300)
          + Math.log(prob > 0 ? prob : 1e-300)
      }
      const maxLog = Math.max(...logWeights)
      const unnormalized = logWeights.map(lw => Math.exp(lw - maxLog))
      const sumResp = unnormalized.reduce((acc, x) => acc + x, 0)

      const mass = sampleWeights[i]
      for (let j = 0; j < k; j++) {
        responsibilities[i][j] = (unnormalized[j] / sumResp) * mass
      }
      // log of the mixture likelihood at this point (log-sum-exp).
      logLikelihoods[i] = (maxLog + Math.log(sumResp)) * mass
    }

    const newLogLikelihood = logLikelihoods.reduce((a, b) => a + b, 0)
    if (Math.abs(newLogLikelihood - logLikelihood) < 1e-4) break
    logLikelihood = newLogLikelihood

    // M-step: update parameters
    for (let j = 0; j < k; j++) {
      const nj = responsibilities.map(r => r[j]).reduce((a, b) => a + b, 0)
      weights[j] = totalMass > 0 ? nj / totalMass : 0

      // Empty component: keep its prior centroid, reset covariance.
      if (nj < 1e-12) {
        for (let dim = 0; dim < d; dim++) {
          covariances[j][dim][dim] = 1.0
        }
        continue
      }

      // Update mean
      for (let dim = 0; dim < d; dim++) {
        let sum = 0
        for (let i = 0; i < n; i++) {
          sum += responsibilities[i][j] * data[i][dim]
        }
        means[j][dim] = sum / nj
      }

      // Update diagonal covariance
      for (let dim = 0; dim < d; dim++) {
        let sum = 0
        for (let i = 0; i < n; i++) {
          const diff = data[i][dim] - means[j][dim]
          sum += responsibilities[i][j] * diff * diff
        }
        covariances[j][dim][dim] = sum / nj + 1e-6  // Regularization
      }
    }
  }

  return { k, means, covariances, weights, logLikelihood, totalMass }
}

/**
 * Gaussian PDF (diagonal covariance)
 */
function gaussianPDF(x: number[], mean: number[], cov: number[][]): number {
  const d = x.length
  let exponent = 0
  let det = 1

  for (let i = 0; i < d; i++) {
    const variance = Math.max(cov[i][i], 1e-6)
    const diff = x[i] - mean[i]
    exponent += (diff * diff) / variance
    det *= variance
  }

  return Math.exp(-0.5 * exponent) / Math.sqrt((2 * Math.PI) ** d * det)
}

/**
 * BIC = -2 * log-likelihood + p * log(n)
 * where p = number of free parameters
 */
function computeBIC(data: number[][], gmm: GMM): number {
  const d = data[0].length
  const k = gmm.k
  // Effective sample size is the total mass, not the row count, so weighted
  // observations use the same penalty scale as unweighted ones.
  const nEff = gmm.totalMass

  // Parameters: k*d (means) + k*d (diagonal variances) + (k-1) (weights)
  const p = k * d + k * d + (k - 1)

  return -2 * gmm.logLikelihood + p * Math.log(nEff)
}

/**
 * Initialize means using k-means++ style
 */
function initializeMeans(data: number[][], k: number, rand: () => number): number[][] {
  const means: number[][] = []
  const n = data.length

  // First centroid: random point
  means.push([...data[Math.floor(rand() * n)]])

  // Remaining centroids: weighted by distance to nearest existing centroid
  for (let j = 1; j < k; j++) {
    let picked: number[] | null = null
    if (j < n) {
      const distances = data.map(point => {
        return Math.min(...means.map(mean =>
          euclideanDistance(point, mean)
        ))
      })

      const sumDist = distances.reduce((a, b) => a + b, 0)

      if (sumDist > 0) {
        const probs = distances.map(dv => dv / sumDist)
        const r = rand()
        let cumulative = 0
        for (let i = 0; i < n; i++) {
          cumulative += probs[i]
          if (r <= cumulative) {
            picked = [...data[i]]
            break
          }
        }
      }
    }

    // k > n, all-zero distances, or a failed draw: duplicate a point
    // with a small jitter so every component has a defined centroid.
    if (!picked) {
      const source = means[j % means.length]
      picked = source.map(v => {
        const jitter = (rand() - 0.5) * 1e-3
        return Math.min(1, Math.max(0, v + jitter))
      })
    }
    means.push(picked)
  }

  return means
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2
  }
  return Math.sqrt(sum)
}
