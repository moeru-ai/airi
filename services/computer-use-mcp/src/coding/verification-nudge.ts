import type {
  CodingRunState,
  CodingScopedValidationCommand,
} from '../state'
import type {
  CodingVerificationGateReasonCode,
  CodingWorkflowGateKind,
} from './verification-gate'

export type CodingVerificationNudgeSeverity = 'info' | 'warning' | 'blocking'

export interface CodingVerificationNudgeTerminalEvidence {
  hasTerminalResult?: boolean
  terminalCommand?: string
  terminalExitCode?: number
}

export interface EvaluateCodingVerificationNudgeParams {
  codingState?: CodingRunState
  workflowKind: CodingWorkflowGateKind
  requestedValidationCommand?: string
  terminalEvidence?: CodingVerificationNudgeTerminalEvidence
  reviewedFileHint?: string
}

export interface CodingVerificationNudge {
  severity: CodingVerificationNudgeSeverity
  reasonCodes: CodingVerificationGateReasonCode[]
  suggestedValidationCommand?: string
  validationScope: 'file' | 'module' | 'workspace'
  disallowedShortcuts: string[]
  message: string
  reviewedFile?: string
}

const WHITESPACE_RE = /\s+/g
const PATH_SEPARATOR_RE = /\\/g
const OBVIOUS_NOOP_RE = /^(?:echo(?:\s|$)|pwd(?:\s|$)|ls(?:\s|$)|cat(?:\s|$))/i

const DISALLOWED_SHORTCUTS = [
  'read_code_without_running_validation',
  'echo',
  'pwd',
  'ls',
  'cat',
]

function normalizeCommand(command?: string) {
  return (command || '').trim().replace(WHITESPACE_RE, ' ').toLowerCase()
}

function normalizePath(filePath?: string) {
  return (filePath || '').trim().replace(PATH_SEPARATOR_RE, '/').toLowerCase()
}

function maxSeverity(left: CodingVerificationNudgeSeverity, right: CodingVerificationNudgeSeverity): CodingVerificationNudgeSeverity {
  const weight: Record<CodingVerificationNudgeSeverity, number> = {
    info: 0,
    warning: 1,
    blocking: 2,
  }

  return weight[left] >= weight[right] ? left : right
}

function hasPendingPlanWork(codingState?: CodingRunState) {
  return Boolean(codingState?.currentPlan?.steps.some(step => step.status !== 'completed'))
}

function hasPendingSessionWork(codingState?: CodingRunState) {
  return Boolean(codingState?.currentPlanSession?.steps.some(step => step.status !== 'validated' && step.status !== 'abandoned'))
}

function buildNearestTestHints(filePath: string) {
  const normalized = normalizePath(filePath)
  if (!normalized) {
    return []
  }

  const lastDotIndex = normalized.lastIndexOf('.')
  if (lastDotIndex <= 0) {
    return []
  }

  const base = normalized.slice(0, lastDotIndex)
  const ext = normalized.slice(lastDotIndex)
  return [`${base}.test${ext}`, `${base}.spec${ext}`]
}

function buildReviewedFileHints(params: {
  reviewedFile?: string
  filesReviewed?: string[]
}) {
  const normalizedFiles = [
    ...(params.filesReviewed || []),
    ...(params.reviewedFile ? [params.reviewedFile] : []),
  ]
    .map(filePath => normalizePath(filePath))
    .filter(Boolean)

  const nearestTests = normalizedFiles.flatMap(filePath => buildNearestTestHints(filePath))
  return Array.from(new Set([...normalizedFiles, ...nearestTests]))
}

function commandTargetsReviewedFile(command: string, fileHints: string[]) {
  if (!command || fileHints.length === 0) {
    return false
  }

  return fileHints.some(fileHint => command.includes(fileHint))
}

function inferValidationScope(params: {
  scopedValidation?: CodingScopedValidationCommand
  candidateCommand: string
  fileHints: string[]
}) {
  if (params.scopedValidation?.scope) {
    return params.scopedValidation.scope
  }

  if (commandTargetsReviewedFile(params.candidateCommand, params.fileHints)) {
    return 'file' as const
  }

  if (params.candidateCommand.includes('eslint') || params.candidateCommand.includes('vitest')) {
    return 'module' as const
  }

  return 'workspace' as const
}

function buildNudgeMessage(params: {
  severity: CodingVerificationNudgeSeverity
  reasonCodes: CodingVerificationGateReasonCode[]
  suggestedValidationCommand?: string
  workflowKind: CodingWorkflowGateKind
}) {
  const reasonText = params.reasonCodes.join(', ')
  const suggestionText = params.suggestedValidationCommand
    ? ` Suggested command: ${params.suggestedValidationCommand}`
    : ''

  if (params.severity === 'blocking') {
    if (params.reasonCodes.includes('verification_bad_faith')) {
      return `Verification rejected (${params.workflowKind}): Used a non-verifiable shortcut (like echo/ls/pwd) instead of a real test. You MUST run actual tests or execute the patched code. Shortcuts are strictly prohibited.${suggestionText}`
    }
    return `Verification nudge (${params.workflowKind}) is blocking due to ${reasonText}.${suggestionText}`
  }

  if (params.severity === 'warning') {
    return `Verification nudge (${params.workflowKind}) requires follow-up for ${reasonText}.${suggestionText}`
  }

  return `Verification nudge (${params.workflowKind}) confirms current validation strategy is acceptable.${suggestionText}`
}

export function evaluateCodingVerificationNudge(params: EvaluateCodingVerificationNudgeParams): CodingVerificationNudge {
  const codingState = params.codingState
  const review = codingState?.lastChangeReview
  const diagnosis = codingState?.lastChangeDiagnosis
  const scopedValidation = codingState?.lastScopedValidationCommand
  const hasTerminalResult = Boolean(params.terminalEvidence?.hasTerminalResult)

  const reviewedFile = params.reviewedFileHint
    || review?.filesReviewed?.[0]
    || codingState?.lastTargetSelection?.selectedFile
    || scopedValidation?.filePath

  const fileHints = buildReviewedFileHints({
    reviewedFile,
    filesReviewed: review?.filesReviewed,
  })

  const candidateCommand = normalizeCommand(
    params.terminalEvidence?.terminalCommand
    || (params.requestedValidationCommand === 'auto' ? '' : params.requestedValidationCommand)
    || review?.validationCommand,
  )
  const scopedCommand = normalizeCommand(scopedValidation?.command)

  const reasonCodes = new Set<CodingVerificationGateReasonCode>()
  let severity: CodingVerificationNudgeSeverity = 'info'

  const addReason = (reasonCode: CodingVerificationGateReasonCode, nextSeverity: CodingVerificationNudgeSeverity) => {
    reasonCodes.add(reasonCode)
    severity = maxSeverity(severity, nextSeverity)
  }

  if (diagnosis?.nextAction === 'abort' || diagnosis?.shouldAbortPlan === true) {
    addReason('abort_required', 'blocking')
  }

  if (diagnosis?.nextAction === 'amend') {
    addReason('amend_required', 'blocking')
  }

  if (review?.status === 'blocked') {
    addReason('review_blocked', 'blocking')
  }

  if (review?.status === 'failed') {
    addReason('review_failed', 'blocking')
  }

  if (review?.status === 'needs_follow_up') {
    addReason('review_needs_follow_up', 'warning')
  }

  if ((review?.unresolvedIssues.length ?? 0) > 0 || review?.detectedRisks.includes('unresolved_issues_remain')) {
    addReason('unresolved_issues_remain', 'blocking')
  }

  if (review?.detectedRisks.includes('patch_verification_mismatch')) {
    addReason('patch_verification_mismatch', 'blocking')
  }

  if (!candidateCommand) {
    addReason('no_validation_run', hasTerminalResult ? 'blocking' : 'warning')
  }
  else if (OBVIOUS_NOOP_RE.test(candidateCommand)) {
    addReason('verification_bad_faith', 'blocking')
  }
  else {
    const alignedToScoped = scopedCommand.length > 0 && candidateCommand === scopedCommand
    const targetsReviewedFile = commandTargetsReviewedFile(candidateCommand, fileHints)

    if (!alignedToScoped && !targetsReviewedFile) {
      addReason('validation_command_mismatch', hasTerminalResult ? 'blocking' : 'warning')
    }
  }

  if (!review) {
    addReason('review_missing', 'warning')
  }

  if (hasPendingPlanWork(codingState) || hasPendingSessionWork(codingState)) {
    addReason('pending_planner_work', 'warning')
  }

  const resolvedReasonCodes = Array.from(reasonCodes)
  if (resolvedReasonCodes.length === 0) {
    resolvedReasonCodes.push('gate_pass')
  }

  const suggestedValidationCommand = scopedValidation?.command
  const validationScope = inferValidationScope({
    scopedValidation,
    candidateCommand,
    fileHints,
  })

  return {
    severity,
    reasonCodes: resolvedReasonCodes,
    suggestedValidationCommand,
    validationScope,
    disallowedShortcuts: DISALLOWED_SHORTCUTS,
    message: buildNudgeMessage({
      severity,
      reasonCodes: resolvedReasonCodes,
      suggestedValidationCommand,
      workflowKind: params.workflowKind,
    }),
    reviewedFile,
  }
}
