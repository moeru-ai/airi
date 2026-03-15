import { describe, expect, it } from 'vitest'

import { buildTargetDecisionCase, resolveTargetJudgement } from './target-case'

describe('target-case', () => {
  const candidates = [
    {
      filePath: 'src/a.ts',
      sourceKind: 'symbol' as const,
      sourceLabel: 'symbol:flag',
      score: 120,
      matchCount: 2,
      inScopedPath: true,
      recentlyEdited: true,
      recentlyRead: true,
      reasons: ['symbol(+120)', 'recent_edit(+2)'],
    },
    {
      filePath: 'src/b.ts',
      sourceKind: 'text' as const,
      sourceLabel: 'text:flag',
      score: 108,
      matchCount: 1,
      inScopedPath: true,
      recentlyEdited: false,
      recentlyRead: true,
      reasons: ['text(+108)'],
    },
  ]

  it('produces winner/runner-up and missingInformation', () => {
    const targetCase = buildTargetDecisionCase({
      changeIntent: 'behavior_fix',
      candidates,
      failingTests: ['src/a.test.ts > should pass'],
      missingInformationHints: ['line number missing'],
    })

    const resolved = resolveTargetJudgement({ targetCase })
    expect(resolved.judgement.winner).toBe('src/a.ts')
    expect(resolved.judgement.runnerUp).toBe('src/b.ts')
    expect(resolved.judgement.missingInformation).toContain('line number missing')
    expect(resolved.judgement.intentDecomposition).toBe('bugfix')
    expect(resolved.judgement.architectureLayer).toBe('unknown')
    expect((resolved.judgement.whyNotRunnerUp || '').length).toBeGreaterThan(0)
  })

  it('keeps deterministic winner stable for same candidate set', () => {
    const targetCase = buildTargetDecisionCase({
      changeIntent: 'behavior_fix',
      candidates,
    })

    const first = resolveTargetJudgement({ targetCase })
    const second = resolveTargetJudgement({ targetCase })

    expect(first.judgement.winner).toBe(second.judgement.winner)
    expect(first.judgement.runnerUp).toBe(second.judgement.runnerUp)
  })

  it('rejects invalid judgement payload and falls back deterministically', () => {
    const targetCase = buildTargetDecisionCase({
      changeIntent: 'behavior_fix',
      candidates,
    })

    const resolved = resolveTargetJudgement({
      targetCase,
      proposedJudgement: {
        winner: '',
        candidateScores: [],
      },
    })

    expect(resolved.usedFallback).toBe(true)
    expect(resolved.judgement.mode).toBe('fallback_deterministic')
    expect(resolved.judgement.winner).toBe('src/a.ts')
    expect(resolved.judgement.intentDecomposition).toBe('bugfix')
    expect(resolved.judgement.architectureLayer).toBe('unknown')
  })

  it('returns a schema-valid deterministic fallback when candidates are empty', () => {
    const targetCase = buildTargetDecisionCase({
      changeIntent: 'behavior_fix',
      candidates: [],
      missingInformationHints: ['need a concrete file candidate'],
    })

    const resolved = resolveTargetJudgement({ targetCase })

    expect(resolved.usedFallback).toBe(false)
    expect(resolved.judgement.mode).toBe('fallback_deterministic')
    expect(resolved.judgement.winner).toBe('__no_target__')
    expect(resolved.judgement.candidateScores).toEqual([
      expect.objectContaining({
        filePath: '__no_target__',
        score: 0,
      }),
    ])
    expect(resolved.judgement.missingInformation).toContain('need a concrete file candidate')
  })
})
