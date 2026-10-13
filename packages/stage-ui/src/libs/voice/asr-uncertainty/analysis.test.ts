import type { Hypothesis } from './analysis'

import { describe, expect, it } from 'vitest'

import { analyzeHypotheses, defaultAnalysisOptions, formatForLlm, joinTokens, toHypothesis } from './analysis'
import { cleanPerturbation } from './perturbation'

function timed(...tokens: [string, number][]): Hypothesis {
  return { tokens: tokens.map(([text, time]) => ({ text, time })) }
}

describe('toHypothesis', () => {
  it('adds the segment start to token times and maps them to the original clip', () => {
    const hypothesis = toHypothesis(
      [{ text: 'ab', tokens: ['a', 'b'], timestamps: [0.1, 0.2], ysProbs: [-0.1, -0.2], startTime: 1 }],
      { snrDb: 20, shiftMs: 100, speed: 1, seed: 1 },
    )

    expect(hypothesis.tokens[0].time).toBeCloseTo(1)
    expect(hypothesis.tokens[1].time).toBeCloseTo(1.1)
    expect(hypothesis.tokens.map(token => token.logProbability)).toEqual([-0.1, -0.2])
  })

  it('leaves times undefined when the model reports none', () => {
    const hypothesis = toHypothesis([{ text: 'ab', tokens: ['a', 'b'], timestamps: [], ysProbs: [], startTime: 0 }], cleanPerturbation)

    expect(hypothesis.tokens.map(token => token.time)).toEqual([undefined, undefined])
  })
})

describe('joinTokens', () => {
  it('turns BPE word markers into spaces and keeps CJK tokens together', () => {
    expect(joinTokens(['▁HE', 'LLO', '▁WORLD'])).toBe('HELLO WORLD')
    expect(joinTokens(['你', '好'])).toBe('你好')
  })
})

describe('analyzeHypotheses', () => {
  it('credits a token only when a sample hears it at the same time', () => {
    // The sample keeps the first "好的" and drops the rest. Edit distance aligns from the end,
    // so it credits the second "好的", which the sample never heard there.
    const reference = timed(['好', 0.2], ['的', 0.4], ['我', 0.8], ['好', 1.2], ['的', 1.4])
    const sample = timed(['好', 0.2], ['的', 0.4])

    const analysis = analyzeHypotheses(reference, [sample], 1.6, defaultAnalysisOptions)

    expect(analysis.tokens.map(token => token.byTime)).toEqual([1, 1, 0, 0, 0])
    expect(analysis.tokens.map(token => token.byText)).toEqual([0, 0, 0, 1, 1])
  })

  it('accepts late emission of the same words at the end of an utterance', () => {
    // Seen with X-ASR on the single-utterance-pipeline case: the last tokens moved by up to 0.4 s between decodes.
    const reference = timed(['▁say', 4.2], ['▁he', 4.48], ['ll', 4.68], ['o', 4.92], ['.', 5.0])
    const late = timed(['▁say', 4.2], ['▁he', 4.48], ['ll', 4.95], ['o', 5.3])

    const analysis = analyzeHypotheses(reference, [late], 5.4, defaultAnalysisOptions)

    expect(analysis.tokens.slice(0, 4).map(token => token.byTime)).toEqual([1, 1, 1, 1])
    expect(analysis.spans).toEqual([])
  })

  it('marks tokens that most samples hear differently, with what they heard', () => {
    const reference = timed(['我', 0.1], ['想', 0.3], ['要', 0.5], ['流', 0.7], ['氓', 0.9], ['怪', 1.1])
    const misheard = timed(['我', 0.1], ['想', 0.3], ['要', 0.5], ['硫', 0.7], ['磺', 0.9], ['怪', 1.1])
    const agreeing = timed(['我', 0.1], ['想', 0.3], ['要', 0.5], ['流', 0.7], ['氓', 0.9], ['怪', 1.1])

    const analysis = analyzeHypotheses(reference, [misheard, misheard, misheard, agreeing], 1.2, defaultAnalysisOptions)

    expect(analysis.spans).toHaveLength(1)
    expect(analysis.spans[0].kind).toBe('unstable')
    expect(analysis.spans[0].tokenStart).toBe(3)
    expect(analysis.spans[0].tokenEnd).toBe(5)
    expect(analysis.spans[0].variants).toEqual([{ text: '硫磺', count: 3 }, { text: '流氓', count: 1 }])
    expect(formatForLlm(reference, analysis.spans)).toBe('我想要 [unclear: "流氓", also heard "硫磺"] 怪')
  })

  it('marks speech that the reference dropped but most samples heard', () => {
    const reference = timed(['我', 0.2], ['要', 1.6])
    const heard = timed(['我', 0.2], ['那', 0.8], ['个', 1.0], ['要', 1.6])
    const silent = timed(['我', 0.2], ['要', 1.6])

    const analysis = analyzeHypotheses(reference, [heard, heard, heard, silent], 1.8, defaultAnalysisOptions)
    const dropped = analysis.spans.filter(span => span.kind === 'dropped')

    expect(dropped).toHaveLength(1)
    expect(dropped[0].tokenStart).toBe(1)
    expect(dropped[0].start).toBeGreaterThan(0.6)
    expect(dropped[0].end).toBeLessThan(1.2)
    expect(dropped[0].variants).toEqual([{ text: '那个', count: 3 }])
    expect(formatForLlm(reference, analysis.spans)).toMatch(/^我 \[possibly missed speech ~0\.\ds: "那个"\] 要$/)
  })

  it('falls back to the text alignment when the model reports no token times', () => {
    const reference = { tokens: [{ text: '我' }, { text: '流' }, { text: '怪' }] }
    const sample = { tokens: [{ text: '我' }, { text: '硫' }, { text: '怪' }] }

    const analysis = analyzeHypotheses(reference, [sample, sample], 1, defaultAnalysisOptions)

    expect(analysis.tokens.map(token => token.byTime)).toEqual([undefined, undefined, undefined])
    expect(analysis.timeline).toEqual([])
    expect(analysis.spans).toEqual([{ kind: 'unstable', start: undefined, end: undefined, tokenStart: 1, tokenEnd: 2, variants: [{ text: '硫', count: 2 }] }])
  })
})
