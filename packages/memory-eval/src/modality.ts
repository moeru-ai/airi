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
  seed = 42  // Deterministic EM initialization
): BimodalityResult {
  // Bimodality needs at least two points: one component cannot be
  // distinguished from another with fewer samples than components.
  if (!data || data.length < 2) {
    return { bimodal: false, bic1: 0, bic2: 0, bicImprovement: 0 }
  }

  // Never request more components than data points.
  const k2 = Math.min(2, data.length)

  // Fit 1-component GMM
  const gmm1 = fitGMM(data, 1, seed)
  const bic1 = computeBIC(data, gmm1)

  // Fit 2-component GMM (falls back to 1 when only one point exists)
  const gmm2 = fitGMM(data, k2, seed + 1)
  const bic2 = computeBIC(data, gmm2)

  const bicImprovement = bic1 - bic2

  return {
    bimodal: bicImprovement > bicThreshold,
    bic1,
    bic2,
    bicImprovement
  }
}

interface GMM {
  k: number
  means: number[][]  // k × d
  covariances: number[][][]  // k × d × d (simplified: diagonal)
  weights: number[]  // k (mixture weights)
  logLikelihood: number
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
 * Fit GMM using EM algorithm (simplified: diagonal covariance)
 */
function fitGMM(data: number[][], k: number, seed = 42, maxIter = 50): GMM {
  const n = data.length
  const d = data[0].length
  const rand = mulberry32(seed)

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
      let sumResp = 0
      for (let j = 0; j < k; j++) {
        const prob = gaussianPDF(data[i], means[j], covariances[j])
        responsibilities[i][j] = weights[j] * prob
        sumResp += responsibilities[i][j]
      }
      for (let j = 0; j < k; j++) {
        responsibilities[i][j] /= sumResp
      }
      logLikelihoods[i] = Math.log(sumResp)
    }

    const newLogLikelihood = logLikelihoods.reduce((a, b) => a + b, 0)
    if (Math.abs(newLogLikelihood - logLikelihood) < 1e-4) break
    logLikelihood = newLogLikelihood

    // M-step: update parameters
    for (let j = 0; j < k; j++) {
      const nj = responsibilities.map(r => r[j]).reduce((a, b) => a + b, 0)
      weights[j] = nj / n

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

  return { k, means, covariances, weights, logLikelihood }
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
  const n = data.length
  const d = data[0].length
  const k = gmm.k

  // Parameters: k*d (means) + k*d (diagonal variances) + (k-1) (weights)
  const p = k * d + k * d + (k - 1)

  return -2 * gmm.logLikelihood + p * Math.log(n)
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
