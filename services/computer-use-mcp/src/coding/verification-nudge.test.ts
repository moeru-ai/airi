import type { CodingRunState } from '../state'

import { describe, expect, it } from 'vitest'

import { evaluateCodingVerificationNudge } from './verification-nudge'

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
      command: 'pnpm exec eslint "src/example.ts"',
      scope: 'file',
      reason: 'test-scoped command',
      filePath: 'src/example.ts',
      resolvedAt: new Date().toISOString(),
    },
    lastChangeReview: {
      status: 'ready_for_next_file',
      filesReviewed: ['src/example.ts'],
      diffSummary: '1 file changed',
      validationSummary: 'ok',
      validationCommand: 'pnpm exec eslint "src/example.ts"',
      baselineComparison: 'unknown',
      detectedRisks: [],
      unresolvedIssues: [],
      recommendedNextAction: 'report completion',
    },
    ...overrides,
  }
}

describe('verification-nudge', () => {
  it('accepts repo-specific validation command when it targets reviewed file', () => {
    const nudge = evaluateCodingVerificationNudge({
      codingState: createCodingState(),
      workflowKind: 'coding_loop',
      requestedValidationCommand: './scripts/check-one-file.sh src/example.ts',
      terminalEvidence: {
        hasTerminalResult: false,
      },
    })

    expect(nudge.severity).toBe('info')
    expect(nudge.reasonCodes).toEqual(['gate_pass'])
    expect(nudge.validationScope).toBe('file')
  })

  it('marks noop commands as blocking', () => {
    const nudge = evaluateCodingVerificationNudge({
      codingState: createCodingState(),
      workflowKind: 'coding_loop',
      requestedValidationCommand: 'echo ok',
      terminalEvidence: {
        hasTerminalResult: false,
      },
    })

    expect(nudge.severity).toBe('blocking')
    expect(nudge.reasonCodes).toContain('validation_command_mismatch')
  })

  it('keeps unresolved issues as blocking even with validation command', () => {
    const nudge = evaluateCodingVerificationNudge({
      codingState: createCodingState({
        lastChangeReview: {
          status: 'needs_follow_up',
          filesReviewed: ['src/example.ts'],
          diffSummary: 'risk remains',
          validationSummary: 'needs follow-up',
          validationCommand: 'pnpm exec eslint "src/example.ts"',
          baselineComparison: 'unknown',
          detectedRisks: ['unresolved_issues_remain'],
          unresolvedIssues: ['fix unresolved issue'],
          recommendedNextAction: 'follow-up',
        },
      }),
      workflowKind: 'coding_loop',
      requestedValidationCommand: 'pnpm exec eslint "src/example.ts"',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm exec eslint "src/example.ts"',
        terminalExitCode: 0,
      },
    })

    expect(nudge.severity).toBe('blocking')
    expect(nudge.reasonCodes).toContain('unresolved_issues_remain')
  })

  it('marks diagnosis amend as blocking', () => {
    const nudge = evaluateCodingVerificationNudge({
      codingState: createCodingState({
        lastChangeDiagnosis: {
          rootCauseType: 'incomplete_change',
          confidence: 0.75,
          evidence: ['missing update'],
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
        terminalCommand: 'pnpm exec eslint "src/example.ts"',
        terminalExitCode: 1,
      },
    })

    expect(nudge.severity).toBe('blocking')
    expect(nudge.reasonCodes).toContain('amend_required')
  })

  it('marks diagnosis abort as blocking', () => {
    const nudge = evaluateCodingVerificationNudge({
      codingState: createCodingState({
        lastChangeDiagnosis: {
          rootCauseType: 'validation_environment_issue',
          confidence: 0.75,
          evidence: ['timeout'],
          affectedFiles: ['src/example.ts'],
          nextAction: 'abort',
          recommendedAction: 'abort plan',
          shouldAmendPlan: false,
          shouldAbortPlan: true,
        },
      }),
      workflowKind: 'coding_agentic_loop',
      terminalEvidence: {
        hasTerminalResult: true,
        terminalCommand: 'pnpm exec eslint "src/example.ts"',
        terminalExitCode: 124,
      },
    })

    expect(nudge.severity).toBe('blocking')
    expect(nudge.reasonCodes).toContain('abort_required')
  })
})
