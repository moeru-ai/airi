/**
 * Regression tests for the issues raised in automated code review on PR #3000.
 * Each block pins one finding so it cannot silently come back.
 */

import { describe, it, expect } from 'vitest'
import { wassersteinDistance, marginalW1ByAxis, centroidProfileDistance } from '../src/barycenter'
import { detectBimodality } from '../src/modality'
import { parseJudgeScore, JudgeOutputError } from '../src/judge-helpers'
import { normalizedTextDistance, fixedPointDistance } from '../src/fixed-point'
import { computeDriftScore } from '../src/drift-score'
import { identityContinuityHarness } from '../src/harness'
import type { FixedPointResult } from '../src/fixed-point'

function fixedPoint(text: string): FixedPointResult {
  return {
    iterations: [text],
    residuals: [0.01],
    converged: true,
    finalResidual: 0.01,
    fixedPoint: text,
  }
}

const stableScores = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    identity: 0.86 + (i % 3) * 0.01,
    value: 0.84,
    expression: 0.85,
    memory: 0.83,
  }))

describe('P1: fixed-point distance is order-sensitive', () => {
  it('distinguishes anagrams/reordered token sequences', () => {
    // Same tokens, different order: character-set distance was zero.
    expect(normalizedTextDistance('a b c d', 'd c b a')).toBeGreaterThan(0)
  })

  it('returns zero for identical text', () => {
    expect(fixedPointDistance('same sentence here', 'same sentence here')).toBe(0)
  })
})

describe('P1: Wasserstein distance preserves rubric axes', () => {
  it('detects an axis swap (it was zero when flattened+sorted)', () => {
    const a = [{ identity: 1, value: 0, expression: 0, memory: 0 }]
    const b = [{ identity: 0, value: 1, expression: 0, memory: 0 }]
    expect(wassersteinDistance(a, b)).toBeGreaterThan(0)
  })

  it('is zero for identical distributions of the same size', () => {
    const s = stableScores(3)
    expect(wassersteinDistance(s, s)).toBeCloseTo(0, 10)
  })

  it('P2: does not zero-pad unequal sample counts', () => {
    // One all-high score vs two identical all-high scores: must be zero,
    // not 0.5 as produced by zero padding.
    const one = [{ identity: 1, value: 1, expression: 1, memory: 1 }]
    const two = [
      { identity: 1, value: 1, expression: 1, memory: 1 },
      { identity: 1, value: 1, expression: 1, memory: 1 },
    ]
    expect(wassersteinDistance(one, two)).toBeCloseTo(0, 6)
  })

  it('P2: rejects empty distributions', () => {
    expect(() => wassersteinDistance([], stableScores(2))).toThrow()
  })
})

describe('P1: drift honors configured thresholds', () => {
  const fp = fixedPoint('a stable self description that stays fixed over time')

  it('does not flag W1 below the configured threshold', () => {
    // w1 around 0.2 with a 0.3 threshold: normalized 0.67 must NOT count as drift.
    const baseline = [{ identity: 0.8, value: 0.8, expression: 0.8, memory: 0.8 }]
    const current = [{ identity: 0.6, value: 0.6, expression: 0.6, memory: 0.6 }]
    const result = computeDriftScore({
      fixedPointBaseline: fp,
      fixedPointCurrent: fp,
      scoresBaseline: baseline,
      scoresCurrent: current,
      w1Threshold: 0.3,
    })
    expect(result.drifted).toBe(false)
  })

  it('flags W1 at or above the configured threshold', () => {
    const baseline = [{ identity: 1, value: 1, expression: 1, memory: 1 }]
    const current = [{ identity: 0.4, value: 0.4, expression: 0.4, memory: 0.4 }]
    const result = computeDriftScore({
      fixedPointBaseline: fp,
      fixedPointCurrent: fp,
      scoresBaseline: baseline,
      scoresCurrent: current,
      w1Threshold: 0.3,
    })
    expect(result.drifted).toBe(true)
  })
})

describe('P1: bimodality fitting is deterministic', () => {
  const cloud = [
    ...Array.from({ length: 12 }, (_, i) => [
      0.82 + (i % 3) * 0.01, 0.8, 0.83, 0.79,
    ]),
    ...Array.from({ length: 12 }, (_, i) => [
      0.31 + (i % 3) * 0.01, 0.29, 0.33, 0.27,
    ]),
  ]

  it('returns identical BIC across repeated calls', () => {
    const runs = Array.from({ length: 5 }, () => detectBimodality(cloud, 10, 42).bicImprovement)
    expect(new Set(runs).size).toBe(1)
  })

  it('still detects the two clusters', () => {
    expect(detectBimodality(cloud, 10, 42).bimodal).toBe(true)
  })
})

describe('P1: judge rejects malformed output', () => {
  it('throws when a required axis is missing', () => {
    expect(() => parseJudgeScore('{"identity":0.9,"value":0.8,"expression":0.7}')).toThrow(JudgeOutputError)
  })

  it('throws when there is no JSON', () => {
    expect(() => parseJudgeScore('sorry I cannot help with that')).toThrow(JudgeOutputError)
  })

  it('throws on a non-finite value', () => {
    expect(() => parseJudgeScore('{"identity":NaN,"value":1,"expression":1,"memory":1}')).toThrow()
  })

  it('parses a valid score and clamps to 0..1', () => {
    const s = parseJudgeScore('{"identity":0.9,"value":0.8,"expression":1.2,"memory":0.5}')
    expect(s).toMatchObject({ identity: 0.9, value: 0.8, expression: 1, memory: 0.5 })
  })
})

describe('P1: harness drives the requested sessions', () => {
  it('runs sessions x messagesPerSession inference calls before current probes', async () => {
    const calls: string[] = []
    const infer = async (prompt: string) => {
      calls.push(prompt)
      return 'stable self description with fixed wording each time'
    }
    const judge = async () => ({ identity: 0.9, value: 0.9, expression: 0.9, memory: 0.9 })

    const result = await identityContinuityHarness({
      character: { name: 'X', persona: 'persona' },
      infer,
      judge,
      probePrompts: ['probe one'],
      sessions: 2,
      messagesPerSession: 3,
      fillerPrompt: 'filler message',
    })

    // 6 filler messages were actually driven.
    expect(result.messagesDriven).toBe(6)
    expect(calls.filter(c => c === 'filler message')).toHaveLength(6)
  })

  it('invokes the compression callback once per session', async () => {
    const infer = async () => 'stable self description with fixed wording each time'
    const judge = async () => ({ identity: 0.9, value: 0.9, expression: 0.9, memory: 0.9 })
    let compressed = 0

    await identityContinuityHarness({
      character: { name: 'X', persona: 'persona' },
      infer,
      judge,
      probePrompts: ['p'],
      sessions: 3,
      messagesPerSession: 2,
      fillerPrompt: 'filler',
      onSessionComplete: async () => { compressed += 1 },
    })

    expect(compressed).toBe(3)
  })

  it('rejects an empty probe list', async () => {
    const infer = async () => 'x'
    const judge = async () => ({ identity: 1, value: 1, expression: 1, memory: 1 })
    await expect(
      identityContinuityHarness({
        character: { name: 'X', persona: 'p' },
        infer,
        judge,
        probePrompts: [],
      })
    ).rejects.toThrow()
  })
})

describe('Round 2 review findings', () => {
  it('P1 round3: W1 is invariant to score ordering (magnitude-tie counterexample)', () => {
    // Same empirical distribution, reversed order. W1 must be exactly zero.
    const a = [
      { identity: 1, value: 0, expression: 0, memory: 0 },
      { identity: 0, value: 1, expression: 0, memory: 0 },
    ]
    const b = [
      { identity: 0, value: 1, expression: 0, memory: 0 },
      { identity: 1, value: 0, expression: 0, memory: 0 },
    ]
    expect(wassersteinDistance(a, b)).toBeCloseTo(0, 10)
  })

  it('P1 round3: centroidProfileDistance reflects barycenter migration', () => {
    // A uniformly high vs uniformly low profile moves the centroid.
    const high = [
      { identity: 0.9, value: 0.9, expression: 0.9, memory: 0.9 },
      { identity: 0.8, value: 0.8, expression: 0.8, memory: 0.8 },
    ]
    const low = [
      { identity: 0.3, value: 0.3, expression: 0.3, memory: 0.3 },
      { identity: 0.4, value: 0.4, expression: 0.4, memory: 0.4 },
    ]
    expect(centroidProfileDistance(high, low)).toBeGreaterThan(0.3)
    const same = [
      { identity: 0.3, value: 0.4, expression: 0.5, memory: 0.6 },
    ]
    expect(centroidProfileDistance(same, same)).toBeCloseTo(0, 10)
    // Same marginals (axis pairing) is the same centroid: zero by design.
    const a = [
      { identity: 0, value: 0, expression: 0, memory: 0 },
      { identity: 1, value: 1, expression: 1, memory: 1 },
    ]
    const b = [
      { identity: 0, value: 1, expression: 0, memory: 1 },
      { identity: 1, value: 0, expression: 1, memory: 0 },
    ]
    expect(centroidProfileDistance(a, b)).toBeCloseTo(0, 10)
  })

  it('P2 round3: W1 honours RubricScore weights', () => {
    // A zero-weight outlier must contribute no mass:
    // [zero(w0), one(w1)] vs [one(w1)] -> 0, not 0.5.
    const a = [
      { identity: 0, value: 0, expression: 0, memory: 0, weight: 0 },
      { identity: 1, value: 1, expression: 1, memory: 1, weight: 1 },
    ]
    const b = [{ identity: 1, value: 1, expression: 1, memory: 1, weight: 1 }]
    expect(wassersteinDistance(a, b)).toBeCloseTo(0, 6)
  })

  it('P1 round3: GMM fit is invariant to data-row ordering', () => {
    // Level multiset grouped vs interleaved, as in the review counterexample.
    const grouped = [
      [0, 0, 0, 0], [0, 0, 0, 0],
      [0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5],
      [1, 1, 1, 1], [1, 1, 1, 1],
    ]
    const interleaved = [
      [0, 0, 0, 0], [0.5, 0.5, 0.5, 0.5],
      [0, 0, 0, 0], [0.5, 0.5, 0.5, 0.5],
      [1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5],
      [1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5],
    ]
    expect(detectBimodality(interleaved, 10, 42).bicImprovement)
      .toBeCloseTo(detectBimodality(grouped, 10, 42).bicImprovement, 6)
  })

  it('P2 round3: rejects non-finite drift thresholds', () => {
    const fp = fixedPoint('a stable self description that stays fixed over time')
    const s = stableScores(4)
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() =>
        computeDriftScore({
          fixedPointBaseline: fp,
          fixedPointCurrent: fp,
          scoresBaseline: s,
          scoresCurrent: s,
          w1Threshold: bad,
        })
      ).toThrow()
    }
  })

  it('P2 round3: harness forwards bicThreshold to drift scoring', async () => {
    const infer = async () => 'a stable self description with fixed wording'
    const judge = async () => ({ identity: 0.9, value: 0.9, expression: 0.9, memory: 0.9 })
    // Should accept a custom BIC threshold without throwing.
    const result = await identityContinuityHarness({
      character: { name: 'X', persona: 'A physicist' },
      infer,
      judge,
      probePrompts: ['p1', 'p2'],
      sessions: 1,
      messagesPerSession: 1,
      fillerPrompt: 'filler',
      bicThreshold: 20,
    })
    expect(result.driftScore).toBeDefined()
    expect(typeof result.driftScore.drifted).toBe('boolean')
  })

  it('P2: integrates exact empirical W1 for unequal sample counts', () => {
    // [0,1] vs [0,0.2,1] on one axis is exactly 1/6.
    const a = [{ identity: 0, value: 0, expression: 0, memory: 0 }, { identity: 1, value: 1, expression: 1, memory: 1 }]
    const b = [
      { identity: 0, value: 0, expression: 0, memory: 0 },
      { identity: 0.2, value: 0.2, expression: 0.2, memory: 0.2 },
      { identity: 1, value: 1, expression: 1, memory: 1 },
    ]
    expect(marginalW1ByAxis(a, b).identity).toBeCloseTo(1 / 6, 6)
  })

  it('P1: non-converging baseline counts as fixed-point instability', () => {
    const baseline: FixedPointResult = {
      iterations: ['a'], residuals: [0.9], converged: false, finalResidual: 0.9, fixedPoint: 'unstable',
    }
    const current = fixedPoint('unstable')
    const s = stableScores(4)
    const result = computeDriftScore({
      fixedPointBaseline: baseline,
      fixedPointCurrent: current,
      scoresBaseline: s,
      scoresCurrent: s,
    })
    expect(result.drifted).toBe(true)
  })

  it('P2: rejects non-positive drift thresholds', () => {
    const fp = fixedPoint('stable self description that does not change')
    const s = stableScores(4)
    expect(() =>
      computeDriftScore({
        fixedPointBaseline: fp,
        fixedPointCurrent: fp,
        scoresBaseline: s,
        scoresCurrent: s,
        w1Threshold: 0,
      })
    ).toThrow()
    expect(() =>
      computeDriftScore({
        fixedPointBaseline: fp,
        fixedPointCurrent: fp,
        scoresBaseline: s,
        scoresCurrent: s,
        fpThreshold: -1,
      })
    ).toThrow()
  })

  it('P2: does not report bimodality from a degenerate two-point fit', () => {
    // Two separated points must not produce a "two personas" result.
    const result = detectBimodality([
      [0, 0, 0, 0],
      [0.5, 0.5, 0.5, 0.5],
    ])
    expect(result.bimodal).toBe(false)
    expect(result.bicImprovement).toBe(0)
  })

  it('P1: harness passes persona as fallback context when systemPrompt is absent', async () => {
    const contexts: (string | undefined)[] = []
    const infer = async (_prompt: string, systemPrompt?: string) => {
      contexts.push(systemPrompt)
      return 'stable self description that does not change'
    }
    const judge = async () => ({ identity: 0.9, value: 0.9, expression: 0.9, memory: 0.9 })

    await identityContinuityHarness({
      character: { name: 'X', persona: 'A physicist' },
      infer,
      judge,
      probePrompts: ['p'],
      sessions: 1,
      messagesPerSession: 1,
      fillerPrompt: 'filler',
    })

    // Every inference call carried the persona as its context.
    expect(contexts.length).toBeGreaterThan(0)
    for (const c of contexts) expect(c).toBe('A physicist')
  })
})
