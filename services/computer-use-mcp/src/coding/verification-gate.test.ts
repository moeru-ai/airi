import type { CodingRunState } from '../state'

import { describe, expect, it } from 'vitest'

import { evaluateCodingVerificationGate } from './verification-gate'

function createCodingState(overrides?: Partial<CodingRunState>): CodingRunState {
  return {
    workspacePath: '/tmp/project',
    gitSummary: 'clean',
    recentReads: [],
    recentEdits: [],
    recentCommandResults: [],
    recentSearches: [],
    pendingIssues: [],
    lastScopedValidationCommand: {
      command: 'pnpm test',
      scope: 'workspace',
      reason: 'test',
      resolvedAt: new Date().toISOString(),
    },
    lastChangeReview: {
      status: 'ready_for_next_file',
      filesReviewed: ['src/example.ts'],
      diffSummary: '1 file changed',
      validationSummary: 'ok',
      validationCommand: 'pnpm test',
      baselineComparison: 'unknown',
      detectedRisks: [],
      unresolvedIssues: [],
      recommendedNextAction: 'report completion',
    },
    ...overrides,
  }
}

describe('coding verification gate', () => {
  it('passes when review is ready, validation evidence exists, and no pending plan/session work', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState(),
      workflowKind: 'coding_loop',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm test',
        terminalExitCode: 0,
      },
    })

    expect(decision.decision).toBe('pass')
    expect(decision.workflowOutcome).toBe('completed')
    expect(decision.finalReportStatus).toBe('completed')
  })

  it('returns needs_follow_up when review status is needs_follow_up', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState({
        lastChangeReview: {
          status: 'needs_follow_up',
          filesReviewed: ['src/example.ts'],
          diffSummary: 'needs follow-up',
          validationSummary: 'follow-up',
          validationCommand: 'pnpm test',
          baselineComparison: 'unknown',
          detectedRisks: ['unresolved_issues_remain'],
          unresolvedIssues: ['need follow-up'],
          recommendedNextAction: 'fix remaining issues',
        },
      }),
      workflowKind: 'coding_loop',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm test',
        terminalExitCode: 0,
      },
    })

    expect(decision.decision).toBe('needs_follow_up')
    expect(decision.reasonCode).toBe('unresolved_issues_remain')
    expect(decision.workflowOutcome).toBe('failed')
  })

  it('fails with amend when diagnosis requires amend', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState({
        lastChangeDiagnosis: {
          rootCauseType: 'incomplete_change',
          confidence: 0.8,
          evidence: ['incomplete'],
          affectedFiles: ['src/example.ts'],
          nextAction: 'amend',
          recommendedAction: 'amend plan',
          shouldAmendPlan: true,
          shouldAbortPlan: false,
        },
      }),
      workflowKind: 'coding_agentic_loop',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm test',
        terminalExitCode: 1,
      },
    })

    expect(decision.decision).toBe('amend')
    expect(decision.reasonCode).toBe('amend_required')
    expect(decision.workflowOutcome).toBe('failed')
  })

  it('fails with abort when diagnosis requires abort', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState({
        lastChangeDiagnosis: {
          rootCauseType: 'validation_environment_issue',
          confidence: 0.8,
          evidence: ['timeout'],
          affectedFiles: ['src/example.ts'],
          nextAction: 'abort',
          recommendedAction: 'abort',
          shouldAmendPlan: false,
          shouldAbortPlan: true,
        },
      }),
      workflowKind: 'coding_agentic_loop',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm test',
        terminalExitCode: 124,
      },
    })

    expect(decision.decision).toBe('abort')
    expect(decision.reasonCode).toBe('abort_required')
    expect(decision.workflowOutcome).toBe('failed')
  })

  it('does not allow completion when review is missing and validation evidence is missing', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState({
        lastChangeReview: undefined,
        lastScopedValidationCommand: undefined,
      }),
      workflowKind: 'coding_loop',
      terminalEvidence: {
        hasTerminalResult: false,
      },
    })

    expect(decision.decision).toBe('needs_follow_up')
    expect(decision.reasonCode).toBe('review_missing')
    expect(decision.workflowOutcome).toBe('failed')
  })

  it('marks mismatch as recheck-eligible only once', () => {
    const state = createCodingState({
      lastChangeReview: {
        status: 'ready_for_next_file',
        filesReviewed: ['src/example.ts'],
        diffSummary: 'ok',
        validationSummary: 'ok',
        validationCommand: 'pnpm some-other-script',
        baselineComparison: 'unknown',
        detectedRisks: [],
        unresolvedIssues: [],
        recommendedNextAction: 'done',
      },
      lastScopedValidationCommand: {
        command: 'pnpm test',
        scope: 'workspace',
        reason: 'targeted validation',
        resolvedAt: new Date().toISOString(),
      },
    })

    const firstDecision = evaluateCodingVerificationGate({
      codingState: state,
      workflowKind: 'coding_loop',
      recheckAttempted: false,
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm some-other-script',
        terminalExitCode: 0,
      },
    })
    expect(firstDecision.decision).toBe('recheck_once')
    expect(firstDecision.reasonCode).toBe('validation_command_mismatch')

    const secondDecision = evaluateCodingVerificationGate({
      codingState: state,
      workflowKind: 'coding_loop',
      recheckAttempted: true,
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm some-other-script',
        terminalExitCode: 0,
      },
    })
    expect(secondDecision.decision).toBe('needs_follow_up')
    expect(secondDecision.reasonCode).toBe('validation_command_mismatch')
  })

  it('treats bad faith commands as immediate hard failure, skipping recheck', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState({
        lastScopedValidationCommand: {
          command: 'pnpm test',
          scope: 'workspace',
          reason: 'targeted validation',
          resolvedAt: new Date().toISOString(),
        },
      }),
      workflowKind: 'coding_loop',
      recheckAttempted: false,
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'echo "all good"',
        terminalExitCode: 0,
      },
    })
    expect(decision.decision).toBe('needs_follow_up')
    expect(decision.reasonCode).toBe('verification_bad_faith')
  })

  it('accepts repo-specific validation commands when terminal and scoped evidence align', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState({
        lastScopedValidationCommand: {
          command: './scripts/check-one-file.sh src/example.ts',
          scope: 'file',
          reason: 'project-specific verifier',
          resolvedAt: new Date().toISOString(),
        },
        lastChangeReview: {
          status: 'ready_for_next_file',
          filesReviewed: ['src/example.ts'],
          diffSummary: 'ok',
          validationSummary: 'custom verifier passed',
          validationCommand: './scripts/check-one-file.sh src/example.ts',
          baselineComparison: 'unknown',
          detectedRisks: [],
          unresolvedIssues: [],
          recommendedNextAction: 'done',
        },
      }),
      workflowKind: 'coding_loop',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: './scripts/check-one-file.sh src/example.ts',
        terminalExitCode: 0,
      },
    })

    expect(decision.decision).toBe('pass')
    expect(decision.reasonCode).toBe('gate_pass')
  })

  it('accepts file-targeted custom validation command even when scoped command is missing', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState({
        lastScopedValidationCommand: undefined,
        lastChangeReview: {
          status: 'ready_for_next_file',
          filesReviewed: ['src/example.ts'],
          diffSummary: 'ok',
          validationSummary: 'custom verifier passed',
          validationCommand: './scripts/check-one-file.sh src/example.ts',
          baselineComparison: 'unknown',
          detectedRisks: [],
          unresolvedIssues: [],
          recommendedNextAction: 'done',
        },
      }),
      workflowKind: 'coding_loop',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: './scripts/check-one-file.sh src/example.ts',
        terminalExitCode: 0,
      },
    })

    expect(decision.decision).toBe('pass')
    expect(decision.reasonCode).toBe('gate_pass')
  })

  it('treats patch_verification_mismatch as recheck-ineligible hard failure', () => {
    const decision = evaluateCodingVerificationGate({
      codingState: createCodingState({
        lastChangeReview: {
          status: 'ready_for_next_file',
          filesReviewed: ['src/example.ts'],
          diffSummary: 'mismatch',
          validationSummary: 'ok',
          validationCommand: 'pnpm test',
          baselineComparison: 'unknown',
          detectedRisks: ['patch_verification_mismatch'],
          unresolvedIssues: [],
          recommendedNextAction: 'fix mismatch',
        },
      }),
      workflowKind: 'coding_loop',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm test',
        terminalExitCode: 0,
      },
    })

    expect(decision.decision).toBe('needs_follow_up')
    expect(decision.reasonCode).toBe('patch_verification_mismatch')
    expect(decision.workflowOutcome).toBe('failed')
  })
})
