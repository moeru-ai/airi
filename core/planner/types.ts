/**
 * AIRI Core — Planner Types
 *
 * Defines the data model for multi-step deterministic plan execution.
 * Plans are composed of steps; steps map to tasks in TaskManager.
 *
 * Design principles:
 * - Branded types for ID safety (PlanId, StepId).
 * - All timestamps are ISO-8601 for serialization safety.
 * - Plans are immutable snapshots — state changes produce new plan objects.
 * - Steps declare dependencies for parallel execution support.
 */

import type { TaskError } from '../tasks/types.js'

// ── Branded IDs ──────────────────────────────────────────────────────────

/** Opaque plan identifier. */
export type PlanId = string & { readonly __brand: 'PlanId' }

/** Opaque step identifier. */
export type StepId = string & { readonly __brand: 'StepId' }

export function createPlanId(raw: string): PlanId {
  return raw as PlanId
}

export function createStepId(raw: string): StepId {
  return raw as StepId
}

// ── Status ────────────────────────────────────────────────────────────────

export type PlanStatus
  = | 'draft'
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'

export type StepStatus
  = | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'skipped'

// ── Step ──────────────────────────────────────────────────────────────────

export interface PlanStep {
  readonly id: StepId
  readonly name: string
  readonly description?: string
  readonly action: string // e.g. "workspace_scan", "file_read", "diff_generate", "patch_propose"
  readonly input: Record<string, unknown> // Action-specific input
  dependencyIds?: StepId[] // Steps that must complete before this one
  readonly timeoutMs?: number // Per-step timeout override
  status: StepStatus
  taskId?: string // Assigned TaskManager task ID
  result?: StepResult
  error?: TaskError
  startedAt?: string
  completedAt?: string
}

export interface StepResult {
  readonly success: boolean
  readonly output?: unknown
  readonly error?: string
  readonly durationMs: number
}

// ── Plan ──────────────────────────────────────────────────────────────────

export interface Plan {
  readonly id: PlanId
  readonly name: string
  readonly description?: string
  readonly steps: PlanStep[]
  status: PlanStatus
  readonly sessionId?: string // Originating session
  readonly createdAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  failureReason?: string
  readonly metadata?: Record<string, unknown>
}

// ── Plan creation input ──────────────────────────────────────────────────

export interface CreatePlanInput {
  readonly name: string
  readonly description?: string
  readonly steps: Omit<PlanStep, 'status' | 'result' | 'error' | 'startedAt' | 'completedAt' | 'taskId'>[]
  readonly sessionId?: string
  readonly metadata?: Record<string, unknown>
}

// ── Plan filter ──────────────────────────────────────────────────────────

export interface PlanFilter {
  readonly status?: PlanStatus
  readonly sessionId?: string
  readonly name?: string
}

// ── Re-export TaskError for convenience ──────────────────────────────────

export type { TaskError } from '../tasks/types.js'
