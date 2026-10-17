/**
 * Vitest regression suite for identity-continuity
 *
 * Tests that fail if drift exceeds thresholds
 */

import { describe, it, expect } from 'vitest'
import { computeFixedPoint } from '../src/fixed-point'
import { wassersteinDistance, computeBarycenter } from '../src/barycenter'
import { detectBimodality } from '../src/modality'
import { cohensKappa } from '../src/kappa'
import { computeDriftScore } from '../src/drift-score'

describe('Identity Continuity Regression', () => {
  // Mock inference function
  const mockInfer = async (prompt: string): Promise<string> => {
    return 'I am a curious explorer who values freedom and connection.'
  }

  it('should converge to a stable fixed point', async () => {
    const result = await computeFixedPoint({
      initialDescription: 'I am an AI assistant.',
      infer: mockInfer,
      maxIterations: 5
    })

    expect(result.converged).toBe(true)
    expect(result.finalResidual).toBeLessThan(0.05)
  })

  it('should detect W1 drift when barycenter migrates', () => {
    const scoresBaseline = [
      { identity: 0.8, value: 0.75, expression: 0.85, memory: 0.8 },
      { identity: 0.82, value: 0.78, expression: 0.83, memory: 0.82 }
    ]

    const scoresDrifted = [
      { identity: 0.5, value: 0.45, expression: 0.55, memory: 0.4 },
      { identity: 0.52, value: 0.48, expression: 0.53, memory: 0.42 }
    ]

    const w1 = wassersteinDistance(scoresBaseline, scoresDrifted)

    expect(w1).toBeGreaterThan(0.3)  // Drift threshold
  })

  it('should detect bimodality when distribution splits', () => {
    // Simulate bimodal data: two clusters in 4D
    const cluster1 = Array(20).fill(null).map(() => [0.8, 0.75, 0.85, 0.8])
    const cluster2 = Array(20).fill(null).map(() => [0.3, 0.25, 0.35, 0.3])
    const bimodalData = [...cluster1, ...cluster2]

    const result = detectBimodality(bimodalData)

    expect(result.bimodal).toBe(true)
    expect(result.bicImprovement).toBeGreaterThan(10)
  })

  it('should validate human-judge calibration (κ >= 0.4)', () => {
    const humanLabels = [0, 0, 1, 1, 0, 1, 0, 1, 1, 0]
    const judgeLabels = [0, 0, 1, 0, 0, 1, 1, 1, 1, 0]  // 70% agreement

    const result = cohensKappa(humanLabels, judgeLabels)

    expect(result.kappa).toBeGreaterThanOrEqual(0.4)
    expect(result.valid).toBe(true)
  })

  it('should keep a stable identity inside the drift threshold', async () => {
    const fpBaseline = await computeFixedPoint({
      initialDescription: 'Baseline persona',
      infer: mockInfer
    })

    const fpCurrent = await computeFixedPoint({
      initialDescription: 'Baseline persona',
      infer: mockInfer
    })

    // Multiple tightly clustered, stable observations (needed for GMM).
    const stableCluster = [
      { identity: 0.86, value: 0.83, expression: 0.87, memory: 0.82 },
      { identity: 0.88, value: 0.84, expression: 0.85, memory: 0.83 },
      { identity: 0.85, value: 0.82, expression: 0.88, memory: 0.81 },
      { identity: 0.87, value: 0.85, expression: 0.86, memory: 0.84 }
    ]

    const driftScore = computeDriftScore({
      fixedPointBaseline: fpBaseline,
      fixedPointCurrent: fpCurrent,
      scoresBaseline: stableCluster,
      scoresCurrent: stableCluster
    })

    // Same identity across sessions: regression must stay green.
    expect(driftScore.drifted).toBe(false)
    expect(driftScore.driftScore).toBeLessThanOrEqual(0.5)
  })

  it('should flag a drifted identity across the drift threshold', async () => {
    const fpBaseline = await computeFixedPoint({
      initialDescription: 'Baseline persona',
      infer: mockInfer
    })

    const fpCurrent = await computeFixedPoint({
      initialDescription: 'A totally different persona now',
      infer: mockInfer
    })

    const scoresBaseline = [
      { identity: 0.86, value: 0.83, expression: 0.87, memory: 0.82 },
      { identity: 0.88, value: 0.84, expression: 0.85, memory: 0.83 },
      { identity: 0.85, value: 0.82, expression: 0.88, memory: 0.81 },
      { identity: 0.87, value: 0.85, expression: 0.86, memory: 0.84 }
    ]

    const scoresCurrent = [
      { identity: 0.32, value: 0.28, expression: 0.35, memory: 0.22 },
      { identity: 0.30, value: 0.26, expression: 0.33, memory: 0.24 },
      { identity: 0.34, value: 0.30, expression: 0.37, memory: 0.20 },
      { identity: 0.31, value: 0.27, expression: 0.34, memory: 0.23 }
    ]

    const driftScore = computeDriftScore({
      fixedPointBaseline: fpBaseline,
      fixedPointCurrent: fpCurrent,
      scoresBaseline,
      scoresCurrent
    })

    expect(driftScore.drifted).toBe(true)
  })
})
