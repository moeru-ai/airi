/**
 * AIRI Core — Cognition Event Types
 *
 * Event definitions for the structured cognition layer. These events are
 * added to the AiriEvent union in core/events/types.ts.
 *
 * Design principles:
 * - Cognition events follow the same envelope pattern as all AIRI events.
 * - Events are emitted at each stage of the cognition pipeline.
 * - Rejected proposals are preserved via events for auditing.
 */

import type { AiriEventBase } from '../events/types.js'
import type { ModelInfo, ProposalId, ReasoningId, ValidationResult } from './types.js'

// ── Cognition lifecycle events ───────────────────────────────────────────

/**
 * Emitted when a cognition request is made.
 */
export interface CognitionRequested extends AiriEventBase {
  readonly type: 'cognition.requested'

  /** The reasoning request identifier. */
  readonly requestId: ReasoningId

  /** Associated session, if any. */
  readonly sessionId?: string

  /** Target workspace, if scoped. */
  readonly workspaceId?: string
}

/**
 * Emitted when a cognition request completes successfully.
 */
export interface CognitionCompleted extends AiriEventBase {
  readonly type: 'cognition.completed'

  /** The reasoning request identifier. */
  readonly requestId: ReasoningId

  /** The generated proposal identifier. */
  readonly proposalId: ProposalId

  /** Model that produced the proposal. */
  readonly modelInfo: ModelInfo

  /** Generation duration in milliseconds. */
  readonly durationMs: number
}

/**
 * Emitted when a cognition request fails.
 */
export interface CognitionFailed extends AiriEventBase {
  readonly type: 'cognition.failed'

  /** The reasoning request identifier. */
  readonly requestId: ReasoningId

  /** Human-readable error message. */
  readonly error: string

  /** Model info, if available before failure. */
  readonly modelInfo?: ModelInfo
}

// ── Plan proposal events ─────────────────────────────────────────────────

/**
 * Emitted when a plan proposal is generated.
 */
export interface PlanProposed extends AiriEventBase {
  readonly type: 'plan.proposed'

  /** The proposal identifier. */
  readonly proposalId: ProposalId

  /** The reasoning request that generated this proposal. */
  readonly requestId: ReasoningId

  /** Human-readable proposal name. */
  readonly name: string

  /** Number of steps in the proposal. */
  readonly stepCount: number

  /** Model's self-reported confidence (0-1). */
  readonly confidence?: number
}

/**
 * Emitted when a plan proposal is validated and accepted.
 */
export interface PlanValidated extends AiriEventBase {
  readonly type: 'plan.validated'

  /** The proposal identifier. */
  readonly proposalId: ProposalId

  /** The PlanId it was converted to. */
  readonly planId: string

  /** The validation result. */
  readonly validationResult: ValidationResult
}

/**
 * Emitted when a plan proposal is rejected by validation.
 */
export interface PlanRejected extends AiriEventBase {
  readonly type: 'plan.rejected'

  /** The proposal identifier. */
  readonly proposalId: ProposalId

  /** Human-readable rejection reason. */
  readonly reason: string

  /** The validation result with error details. */
  readonly validationResult: ValidationResult
}

// ── Union type ───────────────────────────────────────────────────────────

/**
 * Union of all cognition-related events.
 */
export type CognitionEvent
  = | CognitionRequested
    | CognitionCompleted
    | CognitionFailed
    | PlanProposed
    | PlanValidated
    | PlanRejected
