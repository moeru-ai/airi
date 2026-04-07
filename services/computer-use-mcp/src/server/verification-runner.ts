import type {
  ActionInvocation,
  ForegroundContext,
  ScreenshotArtifact,
} from '../types'
import type {
  VerificationContractSummary,
  VerificationFailureDisposition,
  VerificationRepairHint,
} from '../verification-contracts'
import type { ComputerUseServerRuntime } from './runtime'

import { appNamesMatch } from '../app-aliases'
import {
  requireVerificationContract,
  toVerificationContractSummary,
} from '../verification-contracts'

export interface ActionVerificationResult {
  status: 'passed' | 'failed'
  summary: VerificationContractSummary
  failureDisposition: VerificationFailureDisposition
  repairHint: VerificationRepairHint
  reason?: string
  observedContext?: ForegroundContext
}

function buildFailedVerificationResult(params: {
  action: ActionInvocation
  observedContext?: ForegroundContext
  reason: string
}): ActionVerificationResult {
  const contract = requireVerificationContract(params.action.kind)
  return {
    status: 'failed',
    summary: toVerificationContractSummary(contract),
    failureDisposition: contract.failureDisposition,
    repairHint: contract.repairHint,
    reason: params.reason,
    observedContext: params.observedContext,
  }
}

function buildPassedVerificationResult(params: {
  action: ActionInvocation
  observedContext?: ForegroundContext
}): ActionVerificationResult {
  const contract = requireVerificationContract(params.action.kind)
  return {
    status: 'passed',
    summary: toVerificationContractSummary(contract),
    failureDisposition: contract.failureDisposition,
    repairHint: contract.repairHint,
    observedContext: params.observedContext,
  }
}

async function probeForegroundContext(runtime: ComputerUseServerRuntime) {
  const observedContext = await runtime.executor.getForegroundContext()
  runtime.stateManager.updateForegroundContext(observedContext)
  return observedContext
}

async function verifyForegroundMatch(params: {
  runtime: ComputerUseServerRuntime
  action: Extract<ActionInvocation, { kind: 'open_app' | 'focus_app' }>
}) {
  try {
    const observedContext = await probeForegroundContext(params.runtime)
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
  catch (error) {
    return buildFailedVerificationResult({
      action: params.action,
      reason: `unable to refresh foreground context after ${params.action.kind}: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

async function verifySurfaceObservationRefresh(params: {
  runtime: ComputerUseServerRuntime
  action: Extract<ActionInvocation, { kind: 'click' | 'type_text' | 'press_keys' | 'scroll' }>
  screenshot?: ScreenshotArtifact
}) {
  try {
    const observedContext = await probeForegroundContext(params.runtime)
    const observableEvidenceAvailable = Boolean(params.screenshot) || observedContext.available || !observedContext.unavailableReason

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
  catch (error) {
    return buildFailedVerificationResult({
      action: params.action,
      reason: `unable to refresh post-action observation after ${params.action.kind}: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

export async function runPostActionVerification(params: {
  runtime: ComputerUseServerRuntime
  action: ActionInvocation
  screenshot?: ScreenshotArtifact
}): Promise<ActionVerificationResult | undefined> {
  const contract = requireVerificationContract(params.action.kind)
  if (contract.requirement !== 'required') {
    return undefined
  }

  switch (params.action.kind) {
    case 'open_app':
    case 'focus_app':
      return await verifyForegroundMatch({
        runtime: params.runtime,
        action: params.action,
      })
    case 'click':
    case 'type_text':
    case 'press_keys':
    case 'scroll':
      return await verifySurfaceObservationRefresh({
        runtime: params.runtime,
        action: params.action,
        screenshot: params.screenshot,
      })
    default:
      return undefined
  }
}

export function formatVerificationFailure(params: {
  action: ActionInvocation
  verification: ActionVerificationResult
}) {
  const repairText = params.verification.failureDisposition === 'repair_hint' && params.verification.repairHint !== 'none'
    ? ` Suggested repair: ${params.verification.repairHint}.`
    : params.verification.failureDisposition === 'abort'
      ? ' Verification requires aborting without automatic repair.'
      : ''

  return `Verification failed after ${params.action.kind}: ${params.verification.reason || 'unknown verification failure'}.${repairText}`
}
