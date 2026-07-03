/**
 * AIRI Core — Planner Layer
 *
 * Barrel export for the planner subsystem.
 *
 * @example
 * ```ts
 * import {
 *   PlanExecutor,
 *   PlanRegistry,
 *   createPlanId,
 *   createStepId,
 * } from '../core/planner/index.js'
 * ```
 */

export type { TaskError } from '../tasks/types.js'
// ── Events
export type {
  PlanCancelled,
  PlanCompleted,
  PlanFailed,
  PlanStarted,
  StepCompleted,
  StepFailed,
  StepStarted,
} from './events.js'
// ── Executor
export { PlanExecutor } from './executor.js'

export type { PlanExecutorOptions } from './executor.js'

// ── Registry
export { PlanRegistry } from './registry.js'

// ── Types
export type {
  CreatePlanInput,
  Plan,
  PlanFilter,
  PlanId,
  PlanStatus,
  PlanStep,
  StepId,
  StepResult,
  StepStatus,
} from './types.js'
export { createPlanId, createStepId } from './types.js'
