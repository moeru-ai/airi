/**
 * Drift score: unified identity-continuity metric
 *
 * Drift = FP-instability ∨ W1-migration ∨ bimodality
 * Fidelity = 1 - Drift
 */

import type { FixedPointResult } from './fixed-point'
import type { RubricScore } from './barycenter'
import type { BimodalityResult } from './modality'
import { wassersteinDistance } from './barycenter'
import { detectBimodality } from './modality'

export interface DriftScoreResult {
  /** Overall drift score (0-1, higher = more drift) */
  driftScore: number
  /** Identity fidelity (1 - drift) */
  fidelity: number
  /** Fixed-point instability component */
  fpInstability: number
  /** Barycenter migration component */
  w1Migration: number
  /** Bimodality component */
  bimodality: number
  /** Is drifted (any component exceeds threshold)? */
  drifted: boolean
}

export interface DriftScoreConfig {
  /** Fixed-point result (baseline vs current) */
  fixedPointBaseline: FixedPointResult
  fixedPointCurrent: FixedPointResult
  /** Rubric scores (baseline vs current) */
  scoresBaseline: RubricScore[]
  scoresCurrent: RubricScore[]
  /** Thresholds */
  fpThreshold?: number
  w1Threshold?: number
  bicThreshold?: number
}

/**
 * Compute unified drift score
 */
export function computeDriftScore(config: DriftScoreConfig): DriftScoreResult {
  const {
    fixedPointBaseline,
    fixedPointCurrent,
    scoresBaseline,
    scoresCurrent,
    fpThreshold = 0.15,
    w1Threshold = 0.3,
    bicThreshold = 10
  } = config

  // 1. FP instability: did fixed point move or fail to converge?
  let fpInstability = 0
  if (!fixedPointCurrent.converged) {
    fpInstability = 1.0  // Complete instability
  } else {
    // Distance between baseline and current fixed points
    const fpDist = normalizedDistance(
      fixedPointBaseline.fixedPoint,
      fixedPointCurrent.fixedPoint
    )
    fpInstability = Math.min(fpDist / fpThreshold, 1.0)
  }

  // 2. W1 migration
  const w1 = wassersteinDistance(scoresBaseline, scoresCurrent)
  const w1Migration = Math.min(w1 / w1Threshold, 1.0)

  // 3. Bimodality
  const flattenScores = (scores: RubricScore[]): number[][] =>
    scores.map(s => [s.identity, s.value, s.expression, s.memory])

  const bimodalityResult = detectBimodality(flattenScores(scoresCurrent), bicThreshold)
  const bimodality = bimodalityResult.bimodal ? 1.0 : 0.0

  // Unified drift score (max of three components)
  const driftScore = Math.max(fpInstability, w1Migration, bimodality)

  return {
    driftScore,
    fidelity: 1 - driftScore,
    fpInstability,
    w1Migration,
    bimodality,
    drifted: driftScore > 0.5  // At least one component significantly elevated
  }
}

/**
 * Normalized string distance (reuse from fixed-point)
 */
function normalizedDistance(a: string, b: string): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const symmetric = new Set([...setA].filter(x => !setB.has(x)))
  for (const x of setB) {
    if (!setA.has(x)) symmetric.add(x)
  }
  return symmetric.size / Math.max(a.length, b.length)
}
