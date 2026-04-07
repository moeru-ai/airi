import type {
  ActionInvocation,
  ForegroundContext,
  ScreenshotArtifact,
} from '../types'
import type {
  VerificationContractSummary,
  VerificationRepairHint,
} from '../verification-contracts'
import type { ComputerUseServerRuntime } from './runtime'
import type { RuntimeSnapshot } from './runtime-coordinator'
import type { RuntimeFactInvalidationTag } from './runtime-facts'

import { appNamesMatch } from '../app-aliases'
import {
  requireVerificationContract,
  toVerificationContractSummary,
} from '../verification-contracts'
import { isRuntimeFactUsable } from './runtime-facts'

export interface VerificationRepairAttempt {
  hint: VerificationRepairHint
  supported: boolean
  attempted: boolean
  succeeded: boolean
  reason?: string
}

export interface VerificationRunResult {
  status: 'passed' | 'failed' | 'repaired'
  summary: VerificationContractSummary
  reason?: string
  observedContext?: ForegroundContext
  repairAttempt?: VerificationRepairAttempt
}

export interface VerificationRepairResult {
  verification: VerificationRunResult
  repairAttempt: VerificationRepairAttempt
  screenshot?: ScreenshotArtifact
  invalidationTags: readonly RuntimeFactInvalidationTag[]
}

function buildFailedVerificationResult(params: {
  action: ActionInvocation
  observedContext?: ForegroundContext
  reason: string
  repairAttempt?: VerificationRepairAttempt
}): VerificationRunResult {
  const contract = requireVerificationContract(params.action.kind)
  return {
    status: 'failed',
    summary: toVerificationContractSummary(contract),
    reason: params.reason,
    observedContext: params.observedContext,
    repairAttempt: params.repairAttempt,
  }
}

function buildPassedVerificationResult(params: {
  action: ActionInvocation
  observedContext?: ForegroundContext
  repairAttempt?: VerificationRepairAttempt
}): VerificationRunResult {
  const contract = requireVerificationContract(params.action.kind)
  return {
    status: 'passed',
    summary: toVerificationContractSummary(contract),
    observedContext: params.observedContext,
    repairAttempt: params.repairAttempt,
  }
}

function buildRepairedVerificationResult(params: {
  verification: VerificationRunResult
  repairAttempt: VerificationRepairAttempt
}): VerificationRunResult {
  return {
    ...params.verification,
    status: 'repaired',
    repairAttempt: params.repairAttempt,
  }
}

function verifyForegroundMatch(params: {
  postActionSnapshot: RuntimeSnapshot
  action: Extract<ActionInvocation, { kind: 'open_app' | 'focus_app' }>
}) {
  const foregroundFact = params.postActionSnapshot.facts.foregroundContext
  const observedContext = foregroundFact.value

  if (!isRuntimeFactUsable(foregroundFact, { minConfidence: 'medium' })) {
    return buildFailedVerificationResult({
      action: params.action,
      observedContext,
      reason: `stale or unusable foreground fact after ${params.action.kind}`,
    })
  }

  if (observedContext.available && appNamesMatch(params.action.input.app, observedContext.appName)) {
    return buildPassedVerificationResult({
      action: params.action,
      observedContext,
    })
  }

  const reason = observedContext.available
    ? `expected foreground app "${params.action.input.app}" but observed "${observedContext.appName || 'unknown'}"`
    : `foreground context unavailable after ${params.action.kind}: ${observedContext.unavailableReason || 'unknown reason'}`

  return buildFailedVerificationResult({
    action: params.action,
    observedContext,
    reason,
  })
}

function verifySurfaceObservationRefresh(params: {
  postActionSnapshot: RuntimeSnapshot
  action: Extract<ActionInvocation, { kind: 'click' | 'type_text' | 'press_keys' | 'scroll' }>
  screenshot?: ScreenshotArtifact
}) {
  const foregroundFact = params.postActionSnapshot.facts.foregroundContext
  const observedContext = foregroundFact.value

  const hasFreshForeground = isRuntimeFactUsable(foregroundFact, { minConfidence: 'medium' }) && observedContext.available
  const observableEvidenceAvailable = Boolean(params.screenshot) || hasFreshForeground

  if (!observableEvidenceAvailable) {
    return buildFailedVerificationResult({
      action: params.action,
      observedContext,
      reason: `post-action observation refresh for ${params.action.kind} returned no usable evidence`,
    })
  }

  return buildPassedVerificationResult({
    action: params.action,
    observedContext,
  })
}

export function runPostActionVerification(params: {
  action: ActionInvocation
  postActionSnapshot: RuntimeSnapshot
  screenshot?: ScreenshotArtifact
}): VerificationRunResult | undefined {
  const contract = requireVerificationContract(params.action.kind)
  if (contract.requirement !== 'required' || contract.method === 'none') {
    return undefined
  }

  switch (params.action.kind) {
    case 'open_app':
    case 'focus_app':
      return verifyForegroundMatch({
        postActionSnapshot: params.postActionSnapshot,
        action: params.action,
      })
    case 'click':
    case 'type_text':
    case 'press_keys':
    case 'scroll':
      return verifySurfaceObservationRefresh({
        postActionSnapshot: params.postActionSnapshot,
        action: params.action,
        screenshot: params.screenshot,
      })
    default:
      return undefined
  }
}

function supportsRepairHint(params: {
  action: ActionInvocation
  hint: VerificationRepairHint
}) {
  if (params.hint === 'refocus_target_app') {
    return params.action.kind === 'focus_app'
  }

  if (params.hint === 'reopen_target_app') {
    return params.action.kind === 'open_app'
  }

  if (params.hint === 'refresh_surface_observation') {
    return params.action.kind === 'click'
      || params.action.kind === 'type_text'
      || params.action.kind === 'press_keys'
      || params.action.kind === 'scroll'
  }

  return false
}

function syncRuntimeScreenshot(runtime: ComputerUseServerRuntime, screenshot: ScreenshotArtifact) {
  runtime.session.setLastScreenshot(screenshot)
  runtime.stateManager.updateLastScreenshot({
    path: screenshot.path,
    width: screenshot.width,
    height: screenshot.height,
    capturedAt: screenshot.capturedAt,
    placeholder: screenshot.placeholder ?? false,
    note: screenshot.note,
    executionTargetMode: screenshot.executionTargetMode,
    sourceHostName: screenshot.sourceHostName,
    sourceDisplayId: screenshot.sourceDisplayId,
    sourceSessionTag: screenshot.sourceSessionTag,
  })
}

export async function runVerificationRepairAttempt(params: {
  runtime: ComputerUseServerRuntime
  action: ActionInvocation
  failedVerification: VerificationRunResult
  screenshot?: ScreenshotArtifact
}): Promise<VerificationRepairResult> {
  const { action, runtime, failedVerification } = params
  const repairHint = failedVerification.summary.repairHint

  if (failedVerification.summary.failureDisposition !== 'repair_hint' || repairHint === 'none') {
    const repairAttempt: VerificationRepairAttempt = {
      hint: repairHint,
      supported: false,
      attempted: false,
      succeeded: false,
      reason: 'repair execution is not allowed for this verification outcome',
    }

    return {
      verification: buildFailedVerificationResult({
        action,
        observedContext: failedVerification.observedContext,
        reason: failedVerification.reason || 'verification failed before repair stage',
        repairAttempt,
      }),
      repairAttempt,
      screenshot: params.screenshot,
      invalidationTags: [],
    }
  }

  if (!supportsRepairHint({ action, hint: repairHint })) {
    const repairAttempt: VerificationRepairAttempt = {
      hint: repairHint,
      supported: false,
      attempted: false,
      succeeded: false,
      reason: `repair hint "${repairHint}" is unsupported for action kind "${action.kind}" in v3`,
    }

    return {
      verification: buildFailedVerificationResult({
        action,
        observedContext: failedVerification.observedContext,
        reason: failedVerification.reason || 'verification failed and no supported repair is available',
        repairAttempt,
      }),
      repairAttempt,
      screenshot: params.screenshot,
      invalidationTags: [],
    }
  }

  const repairAttempt: VerificationRepairAttempt = {
    hint: repairHint,
    supported: true,
    attempted: true,
    succeeded: false,
  }

  try {
    if (repairHint === 'refocus_target_app' && action.kind === 'focus_app') {
      await runtime.executor.focusApp({ app: action.input.app })
      repairAttempt.succeeded = true
      repairAttempt.reason = `refocused app "${action.input.app}"`
      return {
        verification: failedVerification,
        repairAttempt,
        screenshot: params.screenshot,
        invalidationTags: ['app_lifecycle', 'desktop_mutation'],
      }
    }

    if (repairHint === 'reopen_target_app' && action.kind === 'open_app') {
      await runtime.executor.openApp({ app: action.input.app })
      repairAttempt.succeeded = true
      repairAttempt.reason = `reopened app "${action.input.app}"`
      return {
        verification: failedVerification,
        repairAttempt,
        screenshot: params.screenshot,
        invalidationTags: ['app_lifecycle', 'desktop_mutation'],
      }
    }

    if (repairHint === 'refresh_surface_observation') {
      let screenshot = params.screenshot
      let capturedScreenshotDuringRepair = false
      if (!screenshot) {
        screenshot = await runtime.executor.takeScreenshot({
          label: `${action.kind}-repair-observation`,
        })
        syncRuntimeScreenshot(runtime, screenshot)
        capturedScreenshotDuringRepair = true
      }
      repairAttempt.succeeded = true
      repairAttempt.reason = screenshot
        ? 'refreshed post-action observation and captured screenshot evidence'
        : 'refreshed post-action observation'

      const invalidationTags: RuntimeFactInvalidationTag[] = ['desktop_mutation']
      if (capturedScreenshotDuringRepair) {
        invalidationTags.push('screenshot_refresh')
      }

      return {
        verification: failedVerification,
        repairAttempt,
        screenshot,
        invalidationTags,
      }
    }

    repairAttempt.succeeded = false
    repairAttempt.reason = `repair hint "${repairHint}" has no executable handler`

    return {
      verification: buildFailedVerificationResult({
        action,
        observedContext: failedVerification.observedContext,
        reason: failedVerification.reason || repairAttempt.reason,
        repairAttempt,
      }),
      repairAttempt,
      screenshot: params.screenshot,
      invalidationTags: [],
    }
  }
  catch (error) {
    repairAttempt.succeeded = false
    repairAttempt.reason = error instanceof Error ? error.message : String(error)

    return {
      verification: buildFailedVerificationResult({
        action,
        observedContext: failedVerification.observedContext,
        reason: failedVerification.reason || `repair attempt failed: ${repairAttempt.reason}`,
        repairAttempt,
      }),
      repairAttempt,
      screenshot: params.screenshot,
      invalidationTags: [],
    }
  }
}

export function buildRepairedVerification(params: {
  verification: VerificationRunResult
  repairAttempt: VerificationRepairAttempt
}) {
  return buildRepairedVerificationResult(params)
}

export function formatVerificationFailure(params: {
  action: ActionInvocation
  verification: VerificationRunResult
}) {
  const repairText = params.verification.summary.failureDisposition === 'repair_hint' && params.verification.summary.repairHint !== 'none'
    ? ` Suggested repair: ${params.verification.summary.repairHint}.`
    : params.verification.summary.failureDisposition === 'abort'
      ? ' Verification requires aborting without automatic repair.'
      : ''

  const repairAttemptText = params.verification.repairAttempt?.attempted
    ? ` Repair attempt: ${params.verification.repairAttempt.succeeded ? 'succeeded' : 'failed'}${params.verification.repairAttempt.reason ? ` (${params.verification.repairAttempt.reason})` : ''}.`
    : ''

  return `Verification failed after ${params.action.kind}: ${params.verification.reason || 'unknown verification failure'}.${repairText}${repairAttemptText}`
}
