/**
 * Regression tests for the issues raised in automated code review on PR #3000.
 * Each block pins one finding so it cannot silently come back.
 */

import { describe, it, expect } from 'vitest'
import { wassersteinDistance } from '../src/barycenter'
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
