/**
 * Regression tests for the issues raised in automated code review on PR #3000.
 * Each block pins one finding so it cannot silently come back.
 */

import { describe, it, expect } from 'vitest'
import { wassersteinDistance, marginalW1ByAxis, centroidProfileDistance, computeBarycenter } from '../src/barycenter'
import { detectBimodality } from '../src/modality'
import { parseJudgeScore, JudgeOutputError } from '../src/judge-helpers'
import { normalizedTextDistance, fixedPointDistance, computeFixedPoint } from '../src/fixed-point'
import { cohensKappa } from '../src/kappa'
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

  it('P1 round4: custom judge returning non-finite scores is rejected', async () => {
    const infer = async () => 'a stable self description with fixed wording'
    const badJudge = async () => ({
      identity: Number.NaN, value: 0.9, expression: 0.9, memory: 0.9,
    })
    await expect(
      identityContinuityHarness({
        character: { name: 'X', persona: 'p' },
        infer,
        judge: badJudge,
        probePrompts: ['p'],
        sessions: 0,
        messagesPerSession: 0,
      })
    ).rejects.toThrow()
  })

  it('P2 round4: zero-weight cluster does not create a bimodal split', () => {
    // High-only baseline vs the same highs plus four zero-weight lows.
    const highs = Array.from({ length: 12 }, (_, i) => ({
      identity: 0.86 + (i % 3) * 0.01, value: 0.85, expression: 0.85, memory: 0.84,
    }))
    const lows = Array.from({ length: 4 }, () => ({
      identity: 0.1, value: 0.1, expression: 0.1, memory: 0.1, weight: 0,
    }))
    const current = [...highs, ...lows]
    const result = computeDriftScore({
      fixedPointBaseline: fixedPoint('a stable self description that stays fixed'),
      fixedPointCurrent: fixedPoint('a stable self description that stays fixed'),
      scoresBaseline: highs,
      scoresCurrent: current,
    })
    expect(result.bimodality).toBe(0)
  })

  it('P2 round4: fixed-point rejects invalid iteration limits', async () => {
    const infer = async () => 'same text'
    for (const bad of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN]) {
      await expect(computeFixedPoint({
        initialDescription: 'x', infer, maxIterations: bad,
      })).rejects.toThrow()
    }
  })

  it('P2 round4: harness rejects invalid session counts', async () => {
    const infer = async () => 'same text'
    const judge = async () => ({ identity: 1, value: 1, expression: 1, memory: 1 })
    for (const bad of [Number.POSITIVE_INFINITY, 1.5, -1, Number.NaN]) {
      await expect(identityContinuityHarness({
        character: { name: 'X', persona: 'p' },
        infer, judge, probePrompts: ['p'],
        sessions: bad, messagesPerSession: 1,
      })).rejects.toThrow()
    }
  })

  it('P2 round4: kappa rejects non-binary labels', () => {
    expect(() => cohensKappa([0, 1, 2], [0, 1, 1])).toThrow()
    expect(() => cohensKappa([0, 1], [0, -1])).toThrow()
    expect(() => cohensKappa([], [])).toThrow()
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

  it('P1: harness passes persona (with name) as fallback context when systemPrompt is absent', async () => {
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

    // Context always carries the persona; since round 5 it also carries the name.
    expect(contexts.length).toBeGreaterThan(0)
    for (const c of contexts) {
      expect(c).toContain('A physicist')
      expect(c).toContain('X')
    }
  })

  it('P2 round5: harness context includes the character name', async () => {
    const contexts: (string | undefined)[] = []
    const infer = async (_prompt: string, systemPrompt?: string) => {
      contexts.push(systemPrompt)
      return 'stable self description that does not change'
    }
    const judge = async () => ({ identity: 0.9, value: 0.9, expression: 0.9, memory: 0.9 })

    await identityContinuityHarness({
      character: { name: 'Dr. Lin', persona: 'A physicist' },
      infer,
      judge,
      probePrompts: ['p'],
      sessions: 0,
      messagesPerSession: 0,
    })

    // The configured name must reach the inference context even without a
    // systemPrompt, otherwise identity probes cannot test the character name.
    expect(contexts.length).toBeGreaterThan(0)
    for (const c of contexts) {
      expect(c).toContain('Dr. Lin')
      expect(c).toContain('A physicist')
    }
  })

  it('P2 round5: weighted GMM honours differing positive masses', () => {
    // Four lows with tiny mass should not be equivalent to four lows with mass 1.
    const lows = (mass: number) =>
      Array.from({ length: 4 }, (_, i) => [
        0.15 + (i % 2) * 0.02, 0.12, 0.14, 0.1,
      ]).map(v => ({
        identity: v[0], value: v[1], expression: v[2], memory: v[3], weight: mass,
      }))
    const highs = Array.from({ length: 12 }, (_, i) => ({
      identity: 0.86 + (i % 3) * 0.01, value: 0.85, expression: 0.86, memory: 0.84, weight: 1,
    }))

    const heavy = detectBimodality(
      [...highs, ...lows(1)].map(s => [s.identity, s.value, s.expression, s.memory]),
      10, 42, [...highs.map(() => 1), ...lows(1).map(() => 1)],
    )
    const light = detectBimodality(
      [...highs, ...lows(0.001)].map(s => [s.identity, s.value, s.expression, s.memory]),
      10, 42, [...highs.map(() => 1), ...lows(0.001).map(s => s.weight)],
    )
    // Tiny-mass lows must produce a much smaller BIC gain than unit-mass lows.
    expect(light.bicImprovement).toBeLessThan(heavy.bicImprovement - 5)
  })

  it('P1 round5: CJK sentences split into character tokens', () => {
    // A single-character edit in an unsegmented Japanese sentence must not
    // return maximal distance.
    const d = normalizedTextDistance('私は猫です', '私は犬です')
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(0.5)
  })

  it('P2 round5: fixed-point bounds convergenceThreshold to (0,1]', async () => {
    const infer = async () => 'different output each time'
    await expect(computeFixedPoint({
      initialDescription: 'x', infer, convergenceThreshold: 1.5,
    })).rejects.toThrow()
  })

  it('P2 round5: barycenter rejects zero total weight', () => {
    expect(() => computeBarycenter([
      { identity: 0.9, value: 0.9, expression: 0.9, memory: 0.9, weight: 0 },
    ])).toThrow()
  })

  it('P2 round5: parseJudgeScore rejects bad weight', () => {
    const raw = '{"identity":0.9,"value":0.8,"expression":0.7,"memory":0.6}'
    expect(() => parseJudgeScore(raw, -1)).toThrow()
    expect(() => parseJudgeScore(raw, Number.NaN)).toThrow()
    expect(() => parseJudgeScore(raw, Number.POSITIVE_INFINITY)).toThrow()
  })
})
