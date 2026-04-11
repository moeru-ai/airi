import type { CrossLaneConstraint, CrossLaneHandoffContract } from '../lane-handoff-contract'
import type { VerificationRepairHint } from '../verification-contracts'
import type { VerificationEvidenceRecord } from '../verification-evidence'

export interface HandoffFulfillmentResult {
  status: 'fulfilled' | 'failed' | 'partial'
  fulfilledCount: number
  totalCount: number
  evidence: Record<number, string>
  failureReason?: string
  repairHint?: VerificationRepairHint
}

/**
 * Heuristic evaluator for cross-lane handoff fulfillment.
 * Compares captured evidence against requested constraints.
 */
export function evaluateHandoffFulfillment(
  contract: CrossLaneHandoffContract,
  evidenceRecords: VerificationEvidenceRecord[],
): HandoffFulfillmentResult {
  const constraints = contract.constraints
  const evidence: Record<number, string> = {}
  let fulfilledCount = 0

  if (constraints.length === 0) {
    return {
      status: 'fulfilled',
      fulfilledCount: 0,
      totalCount: 0,
      evidence: {},
    }
  }

  constraints.forEach((constraint, index) => {
    // Basic heuristic: look for evidence that seems to address the constraint surface or keywords
    const matchingEvidence = findMatchingEvidence(constraint, evidenceRecords)

    if (matchingEvidence) {
      evidence[index] = matchingEvidence.summary
      fulfilledCount++
    }
    else if (!constraint.required) {
      // Optional constraints don't block fulfillment but are noted as missing
      evidence[index] = 'Optional constraint: No specific evidence captured.'
      fulfilledCount++
    }
    else {
      evidence[index] = 'Missing required evidence.'
    }
  })

  const status = fulfilledCount === constraints.length
    ? 'fulfilled'
    : fulfilledCount > 0 ? 'partial' : 'failed'

  let failureReason: string | undefined
  if (status !== 'fulfilled') {
    const missingCount = constraints.length - fulfilledCount
    failureReason = `${missingCount} required constraints were not clearly fulfilled.`
  }

  // --- Repair Hint Mapping ---
  let repairHint: VerificationRepairHint = 'none'
  if (status !== 'fulfilled') {
    if (contract.reason === 'validate_visual_state') {
      repairHint = 'refocus_target_app'
    }
    else if (contract.reason === 'validate_runtime_behavior') {
      repairHint = 'refresh_surface_observation'
    }
    else if (contract.reason === 'inspect_network' || contract.reason === 'observe_console_errors') {
      repairHint = 'refresh_surface_observation'
    }
  }

  return {
    status,
    fulfilledCount,
    totalCount: constraints.length,
    evidence,
    failureReason,
    repairHint,
  }
}

/**
 * Searches evidence records for matches against a constraint's description or expected value.
 */
function findMatchingEvidence(
  constraint: CrossLaneConstraint,
  records: VerificationEvidenceRecord[],
): VerificationEvidenceRecord | undefined {
  // 1. Exact match in summaries if possible (weak check)
  const desc = constraint.description.toLowerCase()

  // 2. Check for relevant surface kind matches
  // If the constraint mentions "app" or "window", look for foreground_context
  const needsContext = desc.includes('app') || desc.includes('window') || desc.includes('title')

  return records.find((r) => {
    if (needsContext && r.kind === 'foreground_context')
      return true

    // Check if descriptions overlap
    const summary = r.summary.toLowerCase()
    if (summary.includes(desc))
      return true

    if (constraint.expectedValue) {
      const expected = constraint.expectedValue.toLowerCase()
      if (summary.includes(expected))
        return true
      if (r.observed && Object.values(r.observed).some(v => String(v).toLowerCase().includes(expected)))
        return true
    }

    return false
  })
}
