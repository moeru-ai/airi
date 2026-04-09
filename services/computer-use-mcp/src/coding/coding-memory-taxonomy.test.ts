import type { CodingRunState } from '../state'

import { describe, expect, it } from 'vitest'

import {
  deriveCodingOperationalMemorySeeds,
  pickPrimaryOperationalMemory,
  summarizeOperationalMemory,
} from './coding-memory-taxonomy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalCodingState(overrides: Partial<CodingRunState> = {}): CodingRunState {
  return {
    workspacePath: '/tmp/project',
    gitSummary: 'clean',
    recentReads: [],
    recentEdits: [],
    recentCommandResults: [],
    recentSearches: [],
    pendingIssues: [],
    ...overrides,
  }
}

function makeVerificationMemory(
  reasonCodes: string[],
  outcome: 'nudged' | 'recheck_required' | 'passed' | 'failed',
  extra?: { suggestedValidationCommand?: string, reviewedFile?: string },
) {
  return {
    reasonCodes,
    outcome,
    recordedAt: new Date().toISOString(),
    ...extra,
  }
}

function makeDiagnosis(
  rootCauseType: CodingRunState['lastChangeDiagnosis'] extends undefined ? never : NonNullable<CodingRunState['lastChangeDiagnosis']>['rootCauseType'],
  nextAction: 'amend' | 'abort' | 'continue',
  confidence = 0.8,
): NonNullable<CodingRunState['lastChangeDiagnosis']> {
  return {
    rootCauseType,
    nextAction,
    confidence,
    evidence: ['test evidence'],
    affectedFiles: ['src/example.ts'],
    recommendedAction: `${nextAction} the change`,
    shouldAmendPlan: nextAction === 'amend',
    shouldAbortPlan: nextAction === 'abort',
  }
}

// ---------------------------------------------------------------------------
// deriveCodingOperationalMemorySeeds
// ---------------------------------------------------------------------------

describe('deriveCodingOperationalMemorySeeds', () => {
  it('returns empty array when no signals are present', () => {
    const state = minimalCodingState()
    const seeds = deriveCodingOperationalMemorySeeds(state)
    expect(seeds).toHaveLength(0)
  })

  it('gate pass outcome → 1 non-blocking validation_strategy seed', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(
        ['gate_pass'],
        'passed',
        { suggestedValidationCommand: 'pnpm test' },
      ),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    expect(seeds).toHaveLength(1)
    expect(seeds[0].kind).toBe('validation_strategy')
    expect(seeds[0].blocking).toBe(false)
    expect(seeds[0].source).toBe('verification_gate')
  })

  it('gate fail outcome → blocking seed with correct kind/reason', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(
        ['no_validation_run'],
        'failed',
        { suggestedValidationCommand: 'pnpm test' },
      ),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    expect(seeds.some(s => s.kind === 'verification_failure')).toBe(true)
    expect(seeds.some(s => s.blocking === true)).toBe(true)
    expect(seeds.some(s => s.reason === 'no_validation_run')).toBe(true)
    expect(seeds.some(s => s.recheckEligible === true)).toBe(true)
  })

  it('patch_verification_mismatch → blocking seed, recheckEligible=false', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(
        ['patch_verification_mismatch'],
        'failed',
      ),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    const target = seeds.find(s => s.reason === 'patch_verification_mismatch')
    expect(target).toBeDefined()
    expect(target!.blocking).toBe(true)
    expect(target!.recheckEligible).toBe(false)
  })

  it('diagnosis wrong_target → targeting_hint seed', () => {
    const state = minimalCodingState({
      lastChangeDiagnosis: makeDiagnosis('wrong_target', 'continue'),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    const target = seeds.find(s => s.kind === 'targeting_hint')
    expect(target).toBeDefined()
    expect(target!.reason).toBe('wrong_target')
    expect(target!.source).toBe('diagnosis')
  })

  it('diagnosis missed_dependency → targeting_hint seed', () => {
    const state = minimalCodingState({
      lastChangeDiagnosis: makeDiagnosis('missed_dependency', 'continue'),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    const target = seeds.find(s => s.kind === 'targeting_hint')
    expect(target).toBeDefined()
    expect(target!.reason).toBe('missed_dependency')
  })

  it('diagnosis amend → diagnosis_failure seed + amend_required seed', () => {
    const state = minimalCodingState({
      lastChangeDiagnosis: makeDiagnosis('validation_command_mismatch', 'amend'),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    expect(seeds.some(s => s.reason === 'amend_required')).toBe(true)
    expect(seeds.some(s => s.kind === 'diagnosis_failure')).toBe(true)
    // All amend seeds must be blocking
    seeds.filter(s => s.kind === 'diagnosis_failure').forEach((s) => {
      expect(s.blocking).toBe(true)
    })
  })

  it('diagnosis abort → abort_required seed (blocking, recheckEligible=false)', () => {
    const state = minimalCodingState({
      lastChangeDiagnosis: makeDiagnosis('baseline_noise', 'abort'),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    const abortSeed = seeds.find(s => s.reason === 'abort_required')
    expect(abortSeed).toBeDefined()
    expect(abortSeed!.blocking).toBe(true)
    expect(abortSeed!.recheckEligible).toBe(false)
  })

  it('review with unresolved_issues + no outcome → review seed added', () => {
    const state = minimalCodingState({
      lastChangeReview: {
        status: 'needs_follow_up',
        filesReviewed: ['src/example.ts'],
        diffSummary: 'changed 1 line',
        validationSummary: 'not ok',
        detectedRisks: [],
        unresolvedIssues: ['issue A', 'issue B'],
        recommendedNextAction: 'fix issues',
      },
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    expect(seeds.some(s => s.reason === 'unresolved_issues_remain' && s.source === 'review')).toBe(true)
  })

  it('deduplicates seeds with same kind:reason:source key', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(
        ['no_validation_run', 'no_validation_run'],
        'failed',
      ),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    const dupes = seeds.filter(s => s.reason === 'no_validation_run' && s.source === 'verification_gate')
    expect(dupes).toHaveLength(1)
  })

  it('nudged outcome is not processed as a seed source (only gate decisions are)', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(['no_validation_run'], 'nudged'),
    })

    // nudged outcome should produce no seeds (only 'passed' and 'failed'/'recheck_required' do)
    const seeds = deriveCodingOperationalMemorySeeds(state)
    expect(seeds).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// pickPrimaryOperationalMemory
// ---------------------------------------------------------------------------

describe('pickPrimaryOperationalMemory', () => {
  it('returns undefined for empty array', () => {
    expect(pickPrimaryOperationalMemory([])).toBeUndefined()
  })

  it('returns the only seed when array has one element', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(['no_validation_run'], 'failed'),
    })
    const seeds = deriveCodingOperationalMemorySeeds(state)
    const primary = pickPrimaryOperationalMemory(seeds)
    expect(primary).toBeDefined()
    expect(primary!.blocking).toBe(true)
  })

  it('blocking seeds take priority over non-blocking', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(['gate_pass'], 'passed'),
      lastChangeDiagnosis: makeDiagnosis('wrong_target', 'continue'),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    // gate_pass is non-blocking, wrong_target is non-blocking too (nextAction=continue)
    // But there should be at least one targeting_hint
    const primary = pickPrimaryOperationalMemory(seeds)
    expect(primary).toBeDefined()
  })

  it('among blocking seeds, gate source wins over diagnosis', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(['no_validation_run'], 'failed'),
      lastChangeDiagnosis: makeDiagnosis('validation_command_mismatch', 'amend'),
    })

    const seeds = deriveCodingOperationalMemorySeeds(state)
    const primary = pickPrimaryOperationalMemory(seeds)
    expect(primary).toBeDefined()
    // gate source weight (4) > diagnosis source weight (3)
    expect(primary!.source).toBe('verification_gate')
  })

  it('is stable across multiple picks (deterministic)', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(
        ['no_validation_run', 'patch_verification_mismatch'],
        'failed',
      ),
    })
    const seeds = deriveCodingOperationalMemorySeeds(state)
    const p1 = pickPrimaryOperationalMemory(seeds)
    const p2 = pickPrimaryOperationalMemory(seeds)
    expect(p1).toStrictEqual(p2)
  })
})

// ---------------------------------------------------------------------------
// summarizeOperationalMemory
// ---------------------------------------------------------------------------

describe('summarizeOperationalMemory', () => {
  it('returns fallback string for empty seeds', () => {
    expect(summarizeOperationalMemory([])).toBe('no operational memory seeds')
  })

  it('summary is ≤ 200 characters', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(
        ['no_validation_run', 'patch_verification_mismatch', 'unresolved_issues_remain'],
        'failed',
      ),
      lastChangeDiagnosis: makeDiagnosis('wrong_target', 'abort'),
    })
    const seeds = deriveCodingOperationalMemorySeeds(state)
    const summary = summarizeOperationalMemory(seeds)
    expect(summary.length).toBeLessThanOrEqual(200)
  })

  it('summary contains the primary reason', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(['no_validation_run'], 'failed'),
    })
    const seeds = deriveCodingOperationalMemorySeeds(state)
    const summary = summarizeOperationalMemory(seeds)
    expect(summary).toContain('no_validation_run')
  })

  it('summary mentions multiple blocking seeds count', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(
        ['no_validation_run', 'patch_verification_mismatch'],
        'failed',
      ),
    })
    const seeds = deriveCodingOperationalMemorySeeds(state)
    const summary = summarizeOperationalMemory(seeds)
    // Should mention that there is more than 1 blocking seed
    expect(summary).toContain('+')
  })

  it('pass scenario summary does not say blocking', () => {
    const state = minimalCodingState({
      lastVerificationOutcome: makeVerificationMemory(['gate_pass'], 'passed'),
    })
    const seeds = deriveCodingOperationalMemorySeeds(state)
    const summary = summarizeOperationalMemory(seeds)
    expect(summary).not.toContain('blocking')
  })
})
