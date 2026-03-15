import { describe, expect, it } from 'vitest'

import { buildDiagnosisCase, resolveDiagnosisJudgement } from './diagnosis-case'

function baseCase() {
  return buildDiagnosisCase({
    taskGoal: 'fix regression',
    changeIntent: 'behavior_fix',
    currentNode: 'src/a.ts',
    changedFiles: ['src/a.ts'],
    touchedSymbols: ['flag'],
    impactCompanions: ['src/b.ts'],
    failingTests: ['src/a.test.ts > should update flag'],
    stderrSignature: 'error: expected true got false',
    baselineComparison: 'new_red',
    scopedValidationCommand: 'pnpm exec vitest run src/a.test.ts',
    unresolvedIssues: ['validation_failed'],
    candidateRootCauses: [],
  })
}

describe('diagnosis-case', () => {
  it('supports missed_dependency vs incomplete_change competition', () => {
    const diagnosisCase = {
      ...baseCase(),
      candidateRootCauses: [
        { rootCauseType: 'missed_dependency' as const, score: 0.72, signals: ['unexpected_files_touched'] },
        { rootCauseType: 'incomplete_change' as const, score: 0.61, signals: ['validation_failed'] },
      ],
    }

    const resolved = resolveDiagnosisJudgement({
      diagnosisCase,
      competition: {
        winner: diagnosisCase.candidateRootCauses[0]!,
        runnerUp: diagnosisCase.candidateRootCauses[1]!,
        winnerReason: 'winner=missed_dependency',
        runnerUpReason: 'runnerUp=incomplete_change',
        whyNotRunnerUpReason: 'delta=0.11',
        disambiguationSignals: ['unexpected_files_touched'],
        contestedSignals: [],
        conflicts: [],
      },
      recommendedNextAction: 'amend',
      recommendedRepairWindow: {
        scope: 'dependency_slice',
        files: ['src/a.ts', 'src/b.ts'],
        reason: 'dependency companion likely missed',
      },
      conflictingEvidence: ['validation_failed:also_supports_incomplete_change'],
    })

    expect(resolved.judgement.winner).toBe('missed_dependency')
    expect(resolved.judgement.runnerUp).toBe('incomplete_change')
    expect(resolved.judgement.winnerReason.length).toBeGreaterThan(0)
    expect((resolved.judgement.runnerUpReason || '').length).toBeGreaterThan(0)
    expect(resolved.judgement.conflictingEvidence.length).toBeGreaterThan(0)
  })

  it('supports wrong_target vs missed_dependency competition', () => {
    const diagnosisCase = {
      ...baseCase(),
      candidateRootCauses: [
        { rootCauseType: 'wrong_target' as const, score: 0.77, signals: ['patch_verification_mismatch'] },
        { rootCauseType: 'missed_dependency' as const, score: 0.59, signals: ['impact_companion_or_reference_hit'] },
      ],
    }

    const resolved = resolveDiagnosisJudgement({
      diagnosisCase,
      competition: {
        winner: diagnosisCase.candidateRootCauses[0]!,
        runnerUp: diagnosisCase.candidateRootCauses[1]!,
        winnerReason: 'winner=wrong_target',
        runnerUpReason: 'runnerUp=missed_dependency',
        whyNotRunnerUpReason: 'delta=0.18',
        disambiguationSignals: ['patch_verification_mismatch'],
        contestedSignals: [],
        conflicts: [],
      },
      recommendedNextAction: 'amend',
      recommendedRepairWindow: {
        scope: 'current_file',
        files: ['src/a.ts'],
        reason: 'current target mismatch',
      },
      conflictingEvidence: [],
    })

    expect(resolved.judgement.winner).toBe('wrong_target')
    expect(resolved.judgement.runnerUp).toBe('missed_dependency')
  })

  it('supports baseline_noise vs validation_command_mismatch competition', () => {
    const diagnosisCase = {
      ...baseCase(),
      baselineComparison: 'baseline_noise' as const,
      candidateRootCauses: [
        { rootCauseType: 'baseline_noise' as const, score: 0.69, signals: ['baseline_comparison_baseline_noise'] },
        { rootCauseType: 'validation_command_mismatch' as const, score: 0.52, signals: ['command_not_validation_like'] },
      ],
    }

    const resolved = resolveDiagnosisJudgement({
      diagnosisCase,
      competition: {
        winner: diagnosisCase.candidateRootCauses[0]!,
        runnerUp: diagnosisCase.candidateRootCauses[1]!,
        winnerReason: 'winner=baseline_noise',
        runnerUpReason: 'runnerUp=validation_command_mismatch',
        whyNotRunnerUpReason: 'delta=0.17',
        disambiguationSignals: ['baseline_comparison_baseline_noise'],
        contestedSignals: [],
        conflicts: [],
      },
      recommendedNextAction: 'continue',
      recommendedRepairWindow: {
        scope: 'plan_window',
        files: ['src/a.ts'],
        reason: 'continue within plan window',
      },
      conflictingEvidence: [],
    })

    expect(resolved.judgement.winner).toBe('baseline_noise')
    expect(resolved.judgement.runnerUp).toBe('validation_command_mismatch')
  })

  it('falls back when proposed judgement is invalid', () => {
    const diagnosisCase = {
      ...baseCase(),
      candidateRootCauses: [
        { rootCauseType: 'incomplete_change' as const, score: 0.6, signals: ['validation_failed'] },
        { rootCauseType: 'missed_dependency' as const, score: 0.5, signals: ['impact_companion_or_reference_hit'] },
      ],
    }

    const resolved = resolveDiagnosisJudgement({
      diagnosisCase,
      competition: {
        winner: diagnosisCase.candidateRootCauses[0]!,
        runnerUp: diagnosisCase.candidateRootCauses[1]!,
        winnerReason: 'winner=incomplete_change',
        runnerUpReason: 'runnerUp=missed_dependency',
        whyNotRunnerUpReason: 'delta=0.10',
        disambiguationSignals: ['validation_failed'],
        contestedSignals: [],
        conflicts: [],
      },
      recommendedNextAction: 'amend',
      recommendedRepairWindow: {
        scope: 'current_file',
        files: ['src/a.ts'],
        reason: 'localized repair',
      },
      conflictingEvidence: [],
      proposedJudgement: {
        winner: 'invalid_cause',
        candidateScores: [],
      },
    })

    expect(resolved.usedFallback).toBe(true)
    expect(resolved.judgement.mode).toBe('fallback_deterministic')
    expect(resolved.judgement.winner).toBe('incomplete_change')
  })

  it('keeps counterfactual checks for three root-cause templates', () => {
    const diagnosisCase = {
      ...baseCase(),
      candidateRootCauses: [
        { rootCauseType: 'wrong_target' as const, score: 0.78, signals: ['patch_verification_mismatch'] },
        { rootCauseType: 'missed_dependency' as const, score: 0.66, signals: ['impact_companion_or_reference_hit'] },
        { rootCauseType: 'incomplete_change' as const, score: 0.61, signals: ['validation_failed'] },
      ],
    }

    const resolved = resolveDiagnosisJudgement({
      diagnosisCase,
      competition: {
        winner: diagnosisCase.candidateRootCauses[0]!,
        runnerUp: diagnosisCase.candidateRootCauses[1]!,
        winnerReason: 'winner=wrong_target',
        runnerUpReason: 'runnerUp=missed_dependency',
        whyNotRunnerUpReason: 'delta=0.12',
        disambiguationSignals: ['patch_verification_mismatch'],
        contestedSignals: [],
        conflicts: [],
      },
      recommendedNextAction: 'amend',
      recommendedRepairWindow: {
        scope: 'current_file',
        files: ['src/a.ts'],
        reason: 'target mismatch',
      },
      conflictingEvidence: [],
      counterfactualChecks: [
        {
          id: 'cf_wrong_target',
          hypothesis: 'wrong_target',
          expectedObservation: 'Expected patch mismatch evidence.',
          observedEvidence: ['patch_verification_mismatch'],
          passed: true,
          rationale: 'Mismatch signal observed.',
        },
        {
          id: 'cf_missed_dependency',
          hypothesis: 'missed_dependency',
          expectedObservation: 'Expected dependency impact evidence.',
          observedEvidence: ['impact_companion_or_reference_hit'],
          passed: true,
          rationale: 'Companion/reference hit observed.',
        },
        {
          id: 'cf_incomplete_change',
          hypothesis: 'incomplete_change',
          expectedObservation: 'Expected validation failure evidence.',
          observedEvidence: ['validation_failed'],
          passed: true,
          rationale: 'Validation failure observed.',
        },
      ],
    })

    expect(resolved.judgement.counterfactualChecks).toHaveLength(3)
    expect(resolved.judgement.counterfactualChecks.map(check => check.hypothesis)).toEqual([
      'wrong_target',
      'missed_dependency',
      'incomplete_change',
    ])
    expect(resolved.judgement.counterfactualChecks.every(check => check.passed)).toBe(true)
  })
})
