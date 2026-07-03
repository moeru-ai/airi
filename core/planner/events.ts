/**
 * AIRI Core — Plan Event Types
 *
 * Plan-specific event types emitted during plan orchestration.
 * These are added to the AiriEvent union in core/events/types.ts.
 *
 * Design principles:
 * - Every event carries planId and stepId (where applicable) for correlation.
 * - Events follow the same AiriEventBase envelope as all other core events.
 * - Plan events use "plan." / "step." prefix namespace to avoid collisions.
 */

import type { AiriEventBase } from '../events/types.js'
import type { TaskError } from '../tasks/types.js'

// ── Plan lifecycle events ─────────────────────────────────────────────────

/**
 * Emitted when a plan begins execution.
 */
export interface PlanStarted extends AiriEventBase {
  readonly type: 'plan.started'

  /** The plan's unique identifier. */
  readonly planId: string

  /** Human-readable plan name. */
  readonly name: string

  /** Total number of steps in the plan. */
  readonly stepCount: number
}

/**
 * Emitted when a plan completes successfully.
 */
export interface PlanCompleted extends AiriEventBase {
  readonly type: 'plan.completed'

  readonly planId: string

  readonly name: string

  /** Total execution duration in milliseconds. */
  readonly durationMs: number
}

/**
 * Emitted when a plan fails (a step failed and the plan is marked failed).
 */
export interface PlanFailed extends AiriEventBase {
  readonly type: 'plan.failed'

  readonly planId: string

  readonly name: string

  /** Human-readable failure reason. */
  readonly failureReason?: string

  /** The step that caused the plan to fail, if any. */
  readonly failedStepId?: string
}

/**
 * Emitted when a plan is cancelled (by user or system).
 */
export interface PlanCancelled extends AiriEventBase {
  readonly type: 'plan.cancelled'

  readonly planId: string

  readonly name: string

  /** Optional cancellation reason. */
  readonly reason?: string
}

// ── Step lifecycle events ─────────────────────────────────────────────────

/**
 * Emitted when a step begins execution.
 */
export interface StepStarted extends AiriEventBase {
  readonly type: 'step.started'

  readonly planId: string

  readonly stepId: string

  /** Human-readable step name. */
  readonly stepName: string

  /** The action this step performs. */
  readonly action: string
}

/**
 * Emitted when a step completes successfully.
 */
export interface StepCompleted extends AiriEventBase {
  readonly type: 'step.completed'

  readonly planId: string

  readonly stepId: string

  readonly stepName: string

  /** Whether the step execution succeeded. */
  readonly success: boolean

  /** Step execution duration in milliseconds. */
  readonly durationMs: number
}

/**
 * Emitted when a step fails.
 */
export interface StepFailed extends AiriEventBase {
  readonly type: 'step.failed'

  readonly planId: string

  readonly stepId: string

  readonly stepName: string

  /** Structured error information. */
  readonly error: TaskError
}
