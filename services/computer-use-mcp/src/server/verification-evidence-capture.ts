import type { CrossLaneConstraint, CrossLaneHandoffContract } from '../lane-handoff-contract'
import type { VerificationEvidenceRecord } from '../verification-evidence'
import type { ComputerUseServerRuntime } from './runtime'

import { summarizeRunStateConcise } from './formatters'
import { evaluateHandoffFulfillment } from './handoff-fulfillment'

/**
 * Unified helper for capturing and recording verification evidence in the run state.
 * This ensures that evidence is structured consistently across different tools.
 */
export function captureVerificationEvidence(
  runtime: ComputerUseServerRuntime,
  record: Omit<VerificationEvidenceRecord, 'capturedAt'>,
  evidenceSummary?: string,
) {
  const fullRecord: VerificationEvidenceRecord = {
    ...record,
    capturedAt: new Date().toISOString(),
  }

  // Use the provided summary or fallback to a concise run state summary if not available
  const summary = evidenceSummary || fullRecord.summary

  runtime.stateManager.updateRunState({
    lastVerificationEvidence: [fullRecord],
    lastVerificationEvidenceSummary: summary,
  })

  return fullRecord
}

/**
 * Specialized factory for click-related evidence capture.
 */
export function captureClickEvidence(
  runtime: ComputerUseServerRuntime,
  params: {
    source: string
    actionKind: string
    subject: string
    observed: Record<string, string | number | boolean | null>
    summary: string
  },
) {
  const state = runtime.stateManager.getState()

  return captureVerificationEvidence(
    runtime,
    {
      kind: 'foreground_context',
      source: params.source,
      actionKind: params.actionKind,
      subject: params.subject,
      confidence: 0.8, // Active App/API match
      summary: `${params.summary}\nFacts: ${summarizeRunStateConcise(state)}`,
      blockingEligible: false,
      observed: params.observed,
      relatedRuntimeFacts: ['foregroundContext'],
    },
    params.summary,
  )
}

/**
 * Specialized factory for general UI interaction evidence capture (input, toggle, select).
 */
export function captureUiInteractionEvidence(
  runtime: ComputerUseServerRuntime,
  params: {
    source: string
    actionKind: string
    subject: string
    observed: Record<string, string | number | boolean | null>
    summary: string
  },
) {
  const state = runtime.stateManager.getState()

  return captureVerificationEvidence(
    runtime,
    {
      kind: 'foreground_context',
      source: params.source,
      actionKind: params.actionKind,
      subject: params.subject,
      confidence: 0.8, // API-based interaction result
      summary: `${params.summary}\nFacts: ${summarizeRunStateConcise(state)}`,
      blockingEligible: false,
      observed: params.observed,
      relatedRuntimeFacts: ['foregroundContext'],
    },
    params.summary,
  )
}

/**
 * Specialized factory for handoff evidence capture.
 */
export function captureHandoffEvidence(
  runtime: ComputerUseServerRuntime,
  params: {
    source: string
    handoffId: string
    sourceLane: any // CrossLaneSurface
    targetLane: any // CrossLaneSurface
    reason: any // CrossLaneHandoffHandoffReason
    summary: string
    constraints?: CrossLaneConstraint[]
    observation?: {
      foregroundApp?: string
      windowTitle?: string
    }
  },
) {
  const state = runtime.stateManager.getState()
  const isReturn = params.targetLane === 'coding'

  const record = captureVerificationEvidence(
    runtime,
    {
      kind: 'runtime_fact_summary',
      source: params.source,
      confidence: 0.8, // Handoff evaluation uses API-based context
      summary: params.summary,
      blockingEligible: false,
      observed: {
        handoffId: params.handoffId,
        sourceLane: params.sourceLane,
        targetLane: params.targetLane,
        reason: params.reason,
        ptyCwd: state.ptySessions.find(s => s.id === state.activePtySessionId)?.cwd,
        ...params.observation,
      },
      relatedRuntimeFacts: isReturn ? ['foregroundContext'] : [],
    },
    params.summary,
  )

  // Contract Lifecycle Management
  if (!isReturn && params.constraints) {
    // Initiation: Create and store the active contract
    const contract: CrossLaneHandoffContract = {
      id: params.handoffId,
      sourceLane: params.sourceLane,
      targetLane: params.targetLane,
      reason: params.reason,
      constraints: params.constraints,
      approvalScope: 'none', // Registry placeholder, usually overridden by tool logic
      status: 'active',
      initiatedAt: new Date().toISOString(),
    }

    runtime.stateManager.updateRunState({
      activeHandoffContract: contract,
    })
  }
  else if (isReturn && state.activeHandoffContract) {
    // Resolution: Evaluate fulfillment and move to history
    const activeContract = state.activeHandoffContract
    // NOTICE: Evaluate against a deterministic evidence set that explicitly
    // includes the current return observation. We do not read from stale
    // pre-capture state nor rely on update ordering side effects.
    const evaluationEvidence: VerificationEvidenceRecord[] = [
      ...(state.lastVerificationEvidence || []),
      record,
    ]
    const fulfillment = evaluateHandoffFulfillment(activeContract, evaluationEvidence)

    const resolvedContract: CrossLaneHandoffContract = {
      ...activeContract,
      status: fulfillment.status === 'fulfilled' ? 'fulfilled' : 'failed',
      resolvedAt: new Date().toISOString(),
      evidence: fulfillment.evidence,
      failureReason: fulfillment.failureReason,
      repairHint: fulfillment.repairHint,
    }

    const history = [...state.handoffHistory, resolvedContract].slice(-5)

    runtime.stateManager.updateRunState({
      activeHandoffContract: undefined,
      handoffHistory: history,
    })
  }

  return record
}
