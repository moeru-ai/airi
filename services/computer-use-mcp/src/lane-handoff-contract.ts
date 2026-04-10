import type { OperationApprovalScope, OperationTargetSurface } from './operation-contracts'
import type { TerminalSurface } from './types'
import type { VerificationMethod, VerificationRepairHint } from './verification-contracts'

export type LaneKind = 'workflow' | 'browser' | 'desktop-native' | 'handoff' | 'terminal'

// ---------------------------------------------------------------------------
// Terminal-internal handoff (exec <-> pty surface swap within terminal lane)
// ---------------------------------------------------------------------------

export interface LaneHandoffReadiness {
  /**
   * PTY path expectation for this contract.
   * - none: this handoff does not require PTY preconditions
   * - bound_or_acquire: requires an existing PTY session or an acquire callback
   */
  ptyPath: 'none' | 'bound_or_acquire'
  /**
   * If true, the workflow engine may keep legacy outward reroute behavior when
   * a PTY acquire callback is not available.
   */
  allowLegacyReroute: boolean
}

export interface LaneHandoffContract {
  id: string
  lane: LaneKind
  sourceSurface: TerminalSurface
  targetSurface: TerminalSurface
  approvalScope: OperationApprovalScope
  verificationMethod: VerificationMethod
  readiness: LaneHandoffReadiness
  description: string
}

export interface TerminalHandoffReadinessContext {
  boundPtySessionId?: string
  hasAcquirePtyCallback: boolean
}

export interface LaneHandoffReadinessResult {
  ready: boolean
  reason: string
}

export function evaluateTerminalHandoffReadiness(params: {
  contract: Pick<LaneHandoffContract, 'readiness' | 'targetSurface'>
  context: TerminalHandoffReadinessContext
}): LaneHandoffReadinessResult {
  const { contract, context } = params

  if (contract.targetSurface !== 'pty' || contract.readiness.ptyPath === 'none') {
    return {
      ready: true,
      reason: 'handoff does not require PTY preconditions',
    }
  }

  const hasBoundPtySession = Boolean(context.boundPtySessionId)
  if (hasBoundPtySession) {
    return {
      ready: true,
      reason: `bound PTY session ${context.boundPtySessionId} is available`,
    }
  }

  if (context.hasAcquirePtyCallback) {
    return {
      ready: true,
      reason: 'PTY acquire callback is available',
    }
  }

  if (contract.readiness.allowLegacyReroute) {
    return {
      ready: true,
      reason: 'legacy outward reroute is allowed when PTY acquire callback is missing',
    }
  }

  return {
    ready: false,
    reason: 'handoff requires a bound PTY session or an acquire callback',
  }
}

// ---------------------------------------------------------------------------
// Cross-lane handoff (coding <-> browser <-> terminal)
// ---------------------------------------------------------------------------

/**
 * Reasons the agent may initiate a cross-lane handoff.
 * These are enforced at the tool boundary — the agent must supply a valid reason
 * or the handoff is rejected.
 */
export type CrossLaneHandoffReason
  = | 'validate_visual_state' // coding → browser: verify UI after code change
    | 'validate_runtime_behavior' // coding → terminal: run tests / scripts
    | 'return_evidence' // browser/terminal → coding: deliver verification result
    | 'inspect_network' // coding → browser: check network/API responses
    | 'observe_console_errors' // coding → browser: inspect console after change

/**
 * A constraint that must be satisfied in the target lane before the handoff
 * completes. The receiving lane is responsible for fulfilling each constraint
 * and returning evidence back to the source lane.
 */
export interface CrossLaneConstraint {
  /** Human-readable description of what must be verified. */
  description: string
  /** Whether this constraint is blocking (failure aborts the handoff). */
  required: boolean
  /** Optional expected value or pattern for automated assertion. */
  expectedValue?: string
}

/**
 * The surface targeted in a cross-lane handoff.
 * Maps onto OperationTargetSurface but excludes 'system'.
 */
export type CrossLaneSurface = Extract<OperationTargetSurface, 'coding' | 'browser' | 'terminal' | 'desktop'>

/** Status of a cross-lane handoff attempt. */
export type CrossLaneHandoffStatus
  = | 'pending' // dispatched, target lane not yet entered
    | 'active' // target lane is actively processing
    | 'fulfilled' // all constraints met, evidence returned
    | 'failed' // one or more required constraints could not be met
    | 'cancelled' // handoff abandoned by the initiating lane

/**
 * A contract governing a cross-lane transition (e.g. coding → browser).
 *
 * Unlike terminal-internal LaneHandoffContract which handles exec/pty surface
 * swaps, CrossLaneHandoffContract represents a deliberate, intentional jump
 * between wholly different execution domains.
 */
export interface CrossLaneHandoffContract {
  /** Unique identifier for this handoff invocation. */
  id: string
  /** The lane from which the handoff is being initiated. */
  sourceLane: CrossLaneSurface
  /** The lane the agent is requesting to enter. */
  targetLane: CrossLaneSurface
  /** Declared reason for the handoff — must match allowed reasons for the route. */
  reason: CrossLaneHandoffReason
  /** Verification obligations the target lane must fulfill before returning. */
  constraints: CrossLaneConstraint[]
  /** Approval scope required to execute this handoff. */
  approvalScope: OperationApprovalScope
  /** Current lifecycle status of this handoff. */
  status: CrossLaneHandoffStatus
  /** ISO timestamp when the handoff was created. */
  initiatedAt: string
  /** ISO timestamp when the handoff was resolved (fulfilled or failed). */
  resolvedAt?: string
  /** Evidence collected in the target lane, keyed by constraint index. */
  evidence?: Record<number, string>
  /** Reason for failure if status is 'failed'. */
  failureReason?: string
  /** Suggested repair action for the agent to recover if failed. */
  repairHint?: VerificationRepairHint
}

/**
 * Allowed cross-lane routes and their permitted reasons.
 * Any route not listed here is implicitly denied.
 */
export const CROSS_LANE_ALLOWED_ROUTES: readonly {
  sourceLane: CrossLaneSurface
  targetLane: CrossLaneSurface
  allowedReasons: readonly CrossLaneHandoffReason[]
  approvalScope: OperationApprovalScope
}[] = [
  {
    sourceLane: 'coding',
    targetLane: 'browser',
    allowedReasons: ['validate_visual_state', 'inspect_network', 'observe_console_errors'],
    approvalScope: 'per_action',
  },
  {
    sourceLane: 'browser',
    targetLane: 'coding',
    allowedReasons: ['return_evidence'],
    approvalScope: 'none',
  },
  {
    sourceLane: 'coding',
    targetLane: 'terminal',
    allowedReasons: ['validate_runtime_behavior'],
    approvalScope: 'terminal_and_apps',
  },
  {
    sourceLane: 'terminal',
    targetLane: 'coding',
    allowedReasons: ['return_evidence'],
    approvalScope: 'none',
  },
] as const

export interface CrossLaneRouteValidation {
  allowed: boolean
  reason: string
  approvalScope?: OperationApprovalScope
}

/**
 * Validates that the given cross-lane handoff request is on an approved route
 * with a permitted reason.
 *
 * Returns closed denial for unknown routes or disallowed reasons, matching the
 * fail-closed discipline established in the coding lane.
 */
export function validateCrossLaneRoute(params: {
  sourceLane: CrossLaneSurface
  targetLane: CrossLaneSurface
  reason: CrossLaneHandoffReason
}): CrossLaneRouteValidation {
  const route = CROSS_LANE_ALLOWED_ROUTES.find(
    r => r.sourceLane === params.sourceLane && r.targetLane === params.targetLane,
  )

  if (!route) {
    return {
      allowed: false,
      reason: `No approved route from '${params.sourceLane}' to '${params.targetLane}'. Allowed routes: ${CROSS_LANE_ALLOWED_ROUTES.map(r => `${r.sourceLane}→${r.targetLane}`).join(', ')}.`,
    }
  }

  if (!(route.allowedReasons as readonly string[]).includes(params.reason)) {
    return {
      allowed: false,
      reason: `Reason '${params.reason}' is not allowed for route ${params.sourceLane}→${params.targetLane}. Allowed reasons: ${route.allowedReasons.join(', ')}.`,
    }
  }

  return {
    allowed: true,
    reason: `Route ${params.sourceLane}→${params.targetLane} approved with reason '${params.reason}'.`,
    approvalScope: route.approvalScope,
  }
}
