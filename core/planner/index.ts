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

// ── Types
export type {
	PlanId,
	StepId,
	PlanStatus,
	StepStatus,
	PlanStep,
	StepResult,
	Plan,
	CreatePlanInput,
	PlanFilter,
} from "./types.js"
export type { TaskError } from "../tasks/types.js"
export { createPlanId, createStepId } from "./types.js"

// ── Events
export type {
	PlanStarted,
	PlanCompleted,
	PlanFailed,
	PlanCancelled,
	StepStarted,
	StepCompleted,
	StepFailed,
} from "./events.js"

// ── Registry
export { PlanRegistry } from "./registry.js"

// ── Executor
export { PlanExecutor } from "./executor.js"
export type { PlanExecutorOptions } from "./executor.js"
