import type {
  CodingChangeReview,
  CodingReviewRisk,
  CodingRunState,
} from '../state'

export type CodingWorkflowGateKind = 'coding_loop' | 'coding_agentic_loop'

export type CodingVerificationGateDecisionKind
  = | 'pass'
    | 'recheck_once'
    | 'needs_follow_up'
    | 'amend'
    | 'abort'

export type CodingVerificationGateTrigger
  = | 'no_validation_run'
    | 'validation_command_mismatch'
    | 'verification_bad_faith'
    | 'terminal_exit_nonzero'
    | 'unresolved_issues_remain'
    | 'patch_verification_mismatch'

export type CodingVerificationGateReasonCode
  = | 'gate_pass'
    | 'review_missing'
    | 'review_needs_follow_up'
    | 'review_blocked'
    | 'review_failed'
    | 'pending_planner_work'
    | 'no_validation_run'
    | 'validation_command_mismatch'
    | 'verification_bad_faith'
    | 'terminal_exit_nonzero'
    | 'unresolved_issues_remain'
    | 'patch_verification_mismatch'
    | 'amend_required'
    | 'abort_required'

export interface CodingVerificationEvidenceSummary {
  reviewStatus?: CodingChangeReview['status']
  reviewValidationCommand?: string
  diagnosisNextAction?: 'amend' | 'abort' | 'continue'
  hasValidationBaseline: boolean
  hasScopedValidationCommand: boolean
  scopedValidationCommand?: string
  hasTerminalResult: boolean
  terminalCommand?: string
  terminalExitCode?: number
  hasPendingPlanWork: boolean
  hasPendingSessionWork: boolean
  hasPendingPlannerWork: boolean
  lastReportStatus?: 'completed' | 'in_progress' | 'blocked' | 'failed'
  matchedTriggers: CodingVerificationGateTrigger[]
}

export interface CodingVerificationGateDecision {
  decision: CodingVerificationGateDecisionKind
  finalReportStatus: 'completed' | 'in_progress' | 'blocked' | 'failed'
  workflowOutcome: 'completed' | 'failed'
  reasonCode: CodingVerificationGateReasonCode
  explanation: string
  verificationEvidenceSummary: CodingVerificationEvidenceSummary
}

export interface EvaluateCodingVerificationGateParams {
  codingState?: CodingRunState
  workflowKind: CodingWorkflowGateKind
  recheckAttempted?: boolean
}

const WHITESPACE_RE = /\s+/g
// NOTICE: This regex catches commands that provide zero verification value.
// It must be kept in sync with the copy in verification-nudge.ts.
const OBVIOUS_NOOP_RE = /^(?:echo(?:\s|$)|pwd(?:\s|$)|ls(?:\s|$)|cat(?:\s|$)|true(?:\s|$)|exit\s+0|node\s+-e\s|python[23]?\s+-c\s|printf(?:\s|$))/i

function normalizeCommand(command?: string) {
  return (command || '').trim().replace(WHITESPACE_RE, ' ').toLowerCase()
}

function commandTargetsReviewedFiles(command: string, fileHints: string[]) {
  if (OBVIOUS_NOOP_RE.test(command)) {
    return false
  }

  return fileHints.some((filePath) => {
    const normalizedPath = filePath.trim().toLowerCase()
    return Boolean(normalizedPath) && command.includes(normalizedPath)
  })
}

function hasValidationCommandMismatch(params: {
  hasTerminalResult: boolean
  fileHints: string[]
  reviewValidationCommand?: string
  terminalCommand?: string
  scopedCommand?: string
}) {
  const scopedCommand = normalizeCommand(params.scopedCommand)

  // REVIEW: Missing terminal evidence is handled by the no_validation_run trigger.
  // This branch only decides whether the observed validation command diverged from
  // the resolved scoped command for the current target.
  if (!params.hasTerminalResult) {
    return false
  }

  const observedCommands = Array.from(new Set([
    normalizeCommand(params.terminalCommand),
    normalizeCommand(params.reviewValidationCommand),
  ].filter(Boolean)))

  if (observedCommands.length === 0) {
    return !scopedCommand
  }

  if (params.fileHints.length > 0 && observedCommands.some(command => commandTargetsReviewedFiles(command, params.fileHints))) {
    return false
  }

  if (!scopedCommand) {
    return true
  }

  if (observedCommands.includes(scopedCommand)) {
    return false
  }

  return true
}

function hasPendingPlanWork(codingState?: CodingRunState) {
  return Boolean(codingState?.currentPlan?.steps.some(step => step.status !== 'completed'))
}

function hasPendingSessionWork(codingState?: CodingRunState) {
  return Boolean(codingState?.currentPlanSession?.steps.some(step => step.status !== 'validated' && step.status !== 'abandoned'))
}

function detectTriggers(params: {
  codingState?: CodingRunState
  review?: CodingChangeReview
  diagnosis?: CodingRunState['lastChangeDiagnosis']
}): CodingVerificationGateTrigger[] {
  const { codingState, review, diagnosis } = params
  const risks = new Set<CodingReviewRisk>(review?.detectedRisks || [])
  const triggers = new Set<CodingVerificationGateTrigger>()
  if (!codingState) {
    triggers.add('no_validation_run')
    return Array.from(triggers)
  }

  if (risks.has('no_validation_run')) {
    triggers.add('no_validation_run')
  }

  if (risks.has('patch_verification_mismatch')) {
    triggers.add('patch_verification_mismatch')
  }

  if (risks.has('unresolved_issues_remain') || (review?.unresolvedIssues.length ?? 0) > 0) {
    triggers.add('unresolved_issues_remain')
  }

  if (diagnosis?.rootCauseType === 'validation_command_mismatch') {
    triggers.add('validation_command_mismatch')
  }

  // NOTE: verification_bad_faith is explicitly injected via nudges/terminal checks mapping,
  // but if the diagnosis flags it as validation_command_mismatch, we want to stay open
  // to intercepting that. Right now bad_faith is checked in the downstream evaluation.

  return Array.from(triggers)
}

function buildNeedsFollowUpDecision(params: {
  reasonCode: CodingVerificationGateReasonCode
  explanation: string
  evidence: CodingVerificationEvidenceSummary
  finalReportStatus?: 'in_progress' | 'blocked' | 'failed'
}): CodingVerificationGateDecision {
  return {
    decision: 'needs_follow_up',
    finalReportStatus: params.finalReportStatus ?? 'in_progress',
    workflowOutcome: 'failed',
    reasonCode: params.reasonCode,
    explanation: params.explanation,
    verificationEvidenceSummary: params.evidence,
  }
}

export function evaluateCodingVerificationGate(params: {
  codingState?: CodingRunState
  workflowKind: CodingWorkflowGateKind
  recheckAttempted?: boolean
  terminalEvidence: {
    hasTerminalResult: boolean
    terminalCommand?: string
    terminalExitCode?: number
  }
}): CodingVerificationGateDecision {
  const { codingState, workflowKind, recheckAttempted = false, terminalEvidence } = params
  const review = codingState?.lastChangeReview
  const diagnosis = codingState?.lastChangeDiagnosis

  const hasPendingPlan = hasPendingPlanWork(codingState)
  const hasPendingSession = hasPendingSessionWork(codingState)
  const hasPendingPlannerWork = hasPendingPlan || hasPendingSession

  const triggers = new Set(detectTriggers({ codingState, review, diagnosis }))
  if (!terminalEvidence.hasTerminalResult) {
    triggers.add('no_validation_run')
  }

  const scopedCommand = normalizeCommand(codingState?.lastScopedValidationCommand?.command)
  const fileHints = Array.from(new Set([
    codingState?.lastScopedValidationCommand?.filePath,
    codingState?.lastTargetSelection?.selectedFile,
    ...(review?.filesReviewed || []),
  ].filter((value): value is string => Boolean(value && value.trim()))))
  const candidateCommand = normalizeCommand(
    terminalEvidence.terminalCommand || review?.validationCommand,
  )

  if (OBVIOUS_NOOP_RE.test(candidateCommand)) {
    triggers.add('verification_bad_faith')
  }
  else if (hasValidationCommandMismatch({
    hasTerminalResult: terminalEvidence.hasTerminalResult,
    fileHints,
    reviewValidationCommand: review?.validationCommand,
    terminalCommand: terminalEvidence.terminalCommand,
    scopedCommand,
  })) {
    triggers.add('validation_command_mismatch')
  }

  // Terminal exit code awareness: if the test command exited non-zero but
  // the review still says ready_for_next_file, the evidence is contradictory.
  if (
    terminalEvidence.hasTerminalResult
    && terminalEvidence.terminalExitCode !== undefined
    && terminalEvidence.terminalExitCode !== 0
    && review?.status === 'ready_for_next_file'
  ) {
    triggers.add('terminal_exit_nonzero')
  }

  const evidence: CodingVerificationEvidenceSummary = {
    reviewStatus: review?.status,
    reviewValidationCommand: review?.validationCommand,
    diagnosisNextAction: diagnosis?.nextAction,
    hasValidationBaseline: Boolean(codingState?.validationBaseline),
    hasScopedValidationCommand: Boolean(codingState?.lastScopedValidationCommand),
    scopedValidationCommand: codingState?.lastScopedValidationCommand?.command,
    hasTerminalResult: terminalEvidence.hasTerminalResult,
    terminalCommand: terminalEvidence.terminalCommand,
    terminalExitCode: terminalEvidence.terminalExitCode,
    hasPendingPlanWork: hasPendingPlan,
    hasPendingSessionWork: hasPendingSession,
    hasPendingPlannerWork,
    lastReportStatus: codingState?.lastCodingReport?.status,
    matchedTriggers: Array.from(triggers),
  }

  if (diagnosis?.nextAction === 'abort' || diagnosis?.shouldAbortPlan === true) {
    return {
      decision: 'abort',
      finalReportStatus: 'failed',
      workflowOutcome: 'failed',
      reasonCode: 'abort_required',
      explanation: 'Coding diagnosis requires aborting this workflow run.',
      verificationEvidenceSummary: evidence,
    }
  }

  if (diagnosis?.nextAction === 'amend') {
    return {
      decision: 'amend',
      finalReportStatus: 'in_progress',
      workflowOutcome: 'failed',
      reasonCode: 'amend_required',
      explanation: 'Coding diagnosis requires plan amendment before this run can be completed.',
      verificationEvidenceSummary: evidence,
    }
  }

  if (!review) {
    return buildNeedsFollowUpDecision({
      reasonCode: 'review_missing',
      explanation: 'No coding review evidence is available; completion is blocked by verification gate.',
      evidence,
      finalReportStatus: 'in_progress',
    })
  }

  if (review.status === 'blocked') {
    return buildNeedsFollowUpDecision({
      reasonCode: 'review_blocked',
      explanation: 'Coding review is blocked; workflow cannot be completed.',
      evidence,
      finalReportStatus: 'blocked',
    })
  }

  if (review.status === 'failed') {
    return buildNeedsFollowUpDecision({
      reasonCode: 'review_failed',
      explanation: 'Coding review failed; workflow cannot be completed.',
      evidence,
      finalReportStatus: 'failed',
    })
  }

  if (triggers.has('patch_verification_mismatch')) {
    return buildNeedsFollowUpDecision({
      reasonCode: 'patch_verification_mismatch',
      explanation: 'Patch verification mismatch remains unresolved; recheck cannot auto-clear this risk.',
      evidence,
      finalReportStatus: 'failed',
    })
  }

  if (triggers.has('unresolved_issues_remain')) {
    return buildNeedsFollowUpDecision({
      reasonCode: 'unresolved_issues_remain',
      explanation: 'Unresolved issues remain after review; workflow cannot be completed.',
      evidence,
      finalReportStatus: 'blocked',
    })
  }

  if (triggers.has('verification_bad_faith')) {
    return buildNeedsFollowUpDecision({
      reasonCode: 'verification_bad_faith',
      explanation: 'Verification rejected: Used a non-verifiable shortcut (like echo/ls/pwd/node -e/python -c). You MUST run a real test or execute the patched code to be permitted to complete.',
      evidence,
      finalReportStatus: 'failed',
    })
  }

  if (triggers.has('terminal_exit_nonzero')) {
    return buildNeedsFollowUpDecision({
      reasonCode: 'terminal_exit_nonzero',
      explanation: `Verification rejected: Terminal exit code was ${terminalEvidence.terminalExitCode} (non-zero) but review marked as ready. Fix the failing test before completing.`,
      evidence,
      finalReportStatus: 'failed',
    })
  }

  const canRecheck = !recheckAttempted
    && (triggers.has('no_validation_run') || triggers.has('validation_command_mismatch'))

  if (review.status === 'needs_follow_up') {
    if (canRecheck) {
      const reasonCode: CodingVerificationGateReasonCode = triggers.has('no_validation_run')
        ? 'no_validation_run'
        : 'validation_command_mismatch'
      return {
        decision: 'recheck_once',
        finalReportStatus: 'in_progress',
        workflowOutcome: 'failed',
        reasonCode,
        explanation: 'Review requires follow-up and is eligible for one bounded verification recheck.',
        verificationEvidenceSummary: evidence,
      }
    }

    return buildNeedsFollowUpDecision({
      reasonCode: 'review_needs_follow_up',
      explanation: 'Coding review still requires follow-up after bounded verification checks.',
      evidence,
      finalReportStatus: 'in_progress',
    })
  }

  if (review.status === 'ready_for_next_file' && hasPendingPlannerWork) {
    return buildNeedsFollowUpDecision({
      reasonCode: 'pending_planner_work',
      explanation: 'Review is ready but plan/session still has pending work; completion is not allowed.',
      evidence,
      finalReportStatus: 'in_progress',
    })
  }

  if (triggers.has('no_validation_run') || triggers.has('validation_command_mismatch')) {
    if (canRecheck) {
      const reasonCode: CodingVerificationGateReasonCode = triggers.has('no_validation_run')
        ? 'no_validation_run'
        : 'validation_command_mismatch'
      return {
        decision: 'recheck_once',
        finalReportStatus: 'in_progress',
        workflowOutcome: 'failed',
        reasonCode,
        explanation: 'Validation evidence is insufficient; a single bounded recheck is required.',
        verificationEvidenceSummary: evidence,
      }
    }

    return buildNeedsFollowUpDecision({
      reasonCode: triggers.has('no_validation_run') ? 'no_validation_run' : 'validation_command_mismatch',
      explanation: 'Validation evidence remains insufficient after bounded recheck.',
      evidence,
      finalReportStatus: 'failed',
    })
  }

  if (workflowKind === 'coding_agentic_loop' && diagnosis?.nextAction === 'continue' && review.status !== 'ready_for_next_file') {
    return buildNeedsFollowUpDecision({
      reasonCode: 'review_needs_follow_up',
      explanation: 'Diagnosis suggests continue, but review state is not ready for completion.',
      evidence,
      finalReportStatus: 'in_progress',
    })
  }

  return {
    decision: 'pass',
    finalReportStatus: 'completed',
    workflowOutcome: 'completed',
    reasonCode: 'gate_pass',
    explanation: 'Verification gate passed with sufficient evidence and no pending coding workflow work.',
    verificationEvidenceSummary: evidence,
  }
}
