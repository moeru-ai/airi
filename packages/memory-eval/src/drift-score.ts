/**
 * Drift score: unified identity-continuity metric
 *
 * Drift = W1-migration ∨ bimodality (plus an opt-in fixed-point guard)
 * Fidelity = 1 - Drift
 */

import type { FixedPointResult } from './fixed-point'
import { normalizedTextDistance } from './fixed-point'
import type { RubricScore } from './barycenter'
import { wassersteinDistance } from './barycenter'
import { detectBimodality } from './modality'

export interface DriftScoreResult {
  /** Overall drift score (0-1, higher = more drift) */
  driftScore: number
  /** Identity fidelity (1 - drift) */
  fidelity: number
  /** Fixed-point instability component (diagnostic) */
  fpInstability: number
  /** Barycenter migration component */
  w1Migration: number
  /** Bimodality component */
  bimodality: number
  /** Is drifted (any *counting* component reaches its configured threshold)? */
  drifted: boolean
  /**
   * Did both sessions reach a numerical fixed point of the self-reference
   * operator? Reported for interpretation only: a model that paraphrases
   * itself every turn never converges, which is not by itself identity drift.
   */
  fpConverged: boolean
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
  /**
   * Let the fixed-point component decide `drifted`.
   *
   * Default `false`. `examples/calibrate-fp-threshold.ts` measures the lexical
   * distance of same-identity paraphrases (up to 0.94) against genuinely
   * different characters (from 0.58): the two bands overlap, so the component
   * cannot separate "reworded" from "became someone else". It is reported as a
   * diagnostic and, with this flag, only acts as a guard against gross
   * self-description collapse.
   */
  fpCountsAsDrift?: boolean
}

/**
 * Compute unified drift score.
 *
 * The fixed-point component is a *lexical* self-description diagnostic:
 * `normalizedTextDistance` is an order-sensitive token edit distance, so it
 * responds to wording rather than meaning. Because that band overlaps with real
 * identity change (see `06-验证材料/fixed-point-calibration.json`), the drift
 * verdict rests on the rubric distribution (W1) and its bimodality, which are
 * measured from the judge's scored output rather than from surface text.
 */
export function computeDriftScore(config: DriftScoreConfig): DriftScoreResult {
  const {
    fixedPointBaseline,
    fixedPointCurrent,
    scoresBaseline,
    scoresCurrent,
    fpThreshold = 0.95,
    w1Threshold = 0.3,
    bicThreshold = 10,
    fpCountsAsDrift = false
  } = config

  const isFinitePositive = (x: number) => Number.isFinite(x) && x > 0
  if (
    !isFinitePositive(fpThreshold)
    || !isFinitePositive(w1Threshold)
    || !isFinitePositive(bicThreshold)
  ) {
    throw new Error('fpThreshold, w1Threshold and bicThreshold must be finite positive numbers')
  }

  // 1. FP instability. Two signals, both on the same 0..1 edit-distance scale:
  //    - oscillation: how far the session's own self-description keeps moving;
  //    - shift: how far the two session-end descriptions are from each other.
  //    Taking the maximum keeps one unstable session from being masked by a
  //    stable partner, without turning "the model paraphrases itself" into
  //    maximal drift.
  const fpConverged = fixedPointBaseline.converged && fixedPointCurrent.converged
  const fpOscillation = Math.max(
    fixedPointBaseline.finalResidual,
    fixedPointCurrent.finalResidual
  )
  const fpShift = normalizedTextDistance(
    fixedPointBaseline.fixedPoint,
    fixedPointCurrent.fixedPoint
  )
  const fpRaw = Math.max(fpOscillation, fpShift)
  const fpInstability = Math.min(fpRaw / fpThreshold, 1.0)
  const fpDrift = fpInstability >= 1

  // 2. W1 migration
  const w1 = wassersteinDistance(scoresBaseline, scoresCurrent)
  const w1Migration = Math.min(w1 / w1Threshold, 1.0)

  // 3. Bimodality
  const flattenScores = (scores: RubricScore[]): number[][] =>
    scores.map(s => [s.identity, s.value, s.expression, s.memory])

  // Pass per-score weight so zero-mass observations do not create a split
  // that W1 already excludes.
  const weightsCurrent = scoresCurrent.map(s => s.weight ?? 1)
  const bimodalityResult = detectBimodality(
    flattenScores(scoresCurrent),
    bicThreshold,
    42,
    weightsCurrent
  )
  const bimodality = bimodalityResult.bimodal ? 1.0 : 0.0

  // Unified score (max of the normalized components). Kept for reporting.
  const driftScore = Math.max(fpInstability, w1Migration, bimodality)

  // A component signals drift only when the raw metric reaches its configured
  // threshold, i.e. the normalized component reaches 1. Comparing with 0.5 here
  // would flag drift at half the configured limit (W1 0.15 under a 0.3 limit).
  const w1Drift = w1Migration >= 1
  const bimodalDrift = bimodality >= 1
  const drifted = w1Drift || bimodalDrift || (fpCountsAsDrift && fpDrift)

  return {
    driftScore,
    fidelity: 1 - driftScore,
    fpInstability,
    w1Migration,
    bimodality,
    drifted,
    fpConverged
  }
}
