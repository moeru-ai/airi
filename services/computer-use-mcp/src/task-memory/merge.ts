import type { TaskMemory, TaskMemoryArtifact, TaskMemoryExtraction, TaskMemoryStatus } from './types'

import { TASK_MEMORY_LIMITS } from './types'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES: TaskMemoryStatus[] = ['active', 'blocked', 'done']

function isValidStatus(s: unknown): s is TaskMemoryStatus {
  return typeof s === 'string' && VALID_STATUSES.includes(s as TaskMemoryStatus)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(item => typeof item === 'string')
}

function isValidArtifact(v: unknown): v is TaskMemoryArtifact {
  if (!v || typeof v !== 'object')
    return false
  const a = v as Record<string, unknown>
  return isNonEmptyString(a.label)
    && typeof a.value === 'string'
    && typeof a.kind === 'string'
    && ['file', 'url', 'tool', 'note'].includes(a.kind as string)
}

function isArtifactArray(v: unknown): v is TaskMemoryArtifact[] {
  return Array.isArray(v) && v.every(isValidArtifact)
}

export function hasMeaningfulTaskMemoryExtraction(ext: TaskMemoryExtraction): boolean {
  return isValidStatus(ext.status)
    || isNonEmptyString(ext.goal)
    || isNonEmptyString(ext.currentStep)
    || isStringArray(ext.confirmedFacts) && ext.confirmedFacts.length > 0
    || isArtifactArray(ext.artifacts) && ext.artifacts.length > 0
    || isStringArray(ext.blockers) && ext.blockers.length > 0
    || isNonEmptyString(ext.nextStep)
    || isStringArray(ext.plan) && ext.plan.length > 0
    || isStringArray(ext.workingAssumptions) && ext.workingAssumptions.length > 0
    || isNonEmptyString(ext.recentFailureReason)
    || isStringArray(ext.completionCriteria) && ext.completionCriteria.length > 0
    || ext.newTask === true
}

// ---------------------------------------------------------------------------
// List dedup / trim
// ---------------------------------------------------------------------------

/**
 * Deduplicate a string array keeping last occurrence, trim to limit (tail).
 */
function dedupeAndTrimStrings(arr: string[], limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i].trim()
    if (v && !seen.has(v)) {
      seen.add(v)
      result.unshift(v)
    }
  }
  return result.length > limit ? result.slice(result.length - limit) : result
}

/**
 * Deduplicate artifacts by (kind, value) key; keep last, trim to limit.
 */
function dedupeAndTrimArtifacts(arr: TaskMemoryArtifact[], limit: number): TaskMemoryArtifact[] {
  const seen = new Map<string, number>()
  const result: TaskMemoryArtifact[] = []
  for (const a of arr) {
    const key = `${a.kind}::${a.value}`
    const existing = seen.get(key)
    if (existing !== undefined) {
      result[existing] = a
    }
    else {
      seen.set(key, result.length)
      result.push(a)
    }
  }
  return result.length > limit ? result.slice(result.length - limit) : result
}

// ---------------------------------------------------------------------------
// Merge primitives
// ---------------------------------------------------------------------------

function mergeStringList(old: string[] | undefined, next: string[] | undefined, limit: number): string[] {
  if (next === undefined)
    return old ?? []
  return dedupeAndTrimStrings([...(old ?? []), ...next], limit)
}

function mergeArtifactList(old: TaskMemoryArtifact[] | undefined, next: TaskMemoryArtifact[] | undefined, limit: number): TaskMemoryArtifact[] {
  if (next === undefined)
    return old ?? []
  return dedupeAndTrimArtifacts([...(old ?? []), ...next], limit)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a blank TaskMemory skeleton. */
export function createEmptyTaskMemory(sourceTurnId: string): TaskMemory {
  return {
    status: 'active',
    goal: null,
    currentStep: null,
    confirmedFacts: [],
    artifacts: [],
    blockers: [],
    nextStep: null,
    updatedAt: Date.now(),
    sourceTurnId,
  }
}

export interface MergeTaskMemoryOptions {
  existing: TaskMemory | undefined
  extraction: TaskMemoryExtraction
  sourceTurnId: string
}

/**
 * Validated merge: apply extraction onto existing task memory.
 *
 * Rules:
 * - Scalar: new non-null value wins; empty extraction doesn't clear old
 * - Lists: dedupe merge, trim to hard limits
 * - status=done causes convergence (clears blockers/nextStep/recentFailureReason)
 * - newTask=true triggers soft reset
 */
export function mergeTaskMemory({ existing, extraction, sourceTurnId }: MergeTaskMemoryOptions): TaskMemory {
  const now = Date.now()

  // Soft reset on explicit new task
  if (extraction.newTask) {
    const base = createEmptyTaskMemory(sourceTurnId)
    return applyExtraction(base, extraction, sourceTurnId, now)
  }

  const base: TaskMemory = existing
    ? { ...existing }
    : createEmptyTaskMemory(sourceTurnId)

  return applyExtraction(base, extraction, sourceTurnId, now)
}

function applyExtraction(
  base: TaskMemory,
  ext: TaskMemoryExtraction,
  sourceTurnId: string,
  now: number,
): TaskMemory {
  const status: TaskMemoryStatus = isValidStatus(ext.status) ? ext.status : base.status

  const goal = isNonEmptyString(ext.goal) ? ext.goal : base.goal
  const currentStep = isNonEmptyString(ext.currentStep) ? ext.currentStep : base.currentStep
  const nextStep = isNonEmptyString(ext.nextStep) ? ext.nextStep : base.nextStep
  const recentFailureReason = isNonEmptyString(ext.recentFailureReason) ? ext.recentFailureReason : base.recentFailureReason ?? null

  const confirmedFacts = mergeStringList(
    base.confirmedFacts,
    isStringArray(ext.confirmedFacts) ? ext.confirmedFacts : undefined,
    TASK_MEMORY_LIMITS.confirmedFacts,
  )
  const artifacts = mergeArtifactList(
    base.artifacts,
    isArtifactArray(ext.artifacts) ? ext.artifacts : undefined,
    TASK_MEMORY_LIMITS.artifacts,
  )
  const blockers = mergeStringList(
    base.blockers,
    isStringArray(ext.blockers) ? ext.blockers : undefined,
    TASK_MEMORY_LIMITS.blockers,
  )
  const plan = mergeStringList(
    base.plan,
    isStringArray(ext.plan) ? ext.plan : undefined,
    TASK_MEMORY_LIMITS.plan,
  )
  const workingAssumptions = mergeStringList(
    base.workingAssumptions,
    isStringArray(ext.workingAssumptions) ? ext.workingAssumptions : undefined,
    TASK_MEMORY_LIMITS.workingAssumptions,
  )
  const completionCriteria = mergeStringList(
    base.completionCriteria,
    isStringArray(ext.completionCriteria) ? ext.completionCriteria : undefined,
    TASK_MEMORY_LIMITS.completionCriteria,
  )

  const result: TaskMemory = {
    status,
    goal,
    currentStep,
    confirmedFacts,
    artifacts,
    blockers,
    nextStep,
    updatedAt: now,
    sourceTurnId,
    recentFailureReason,
  }

  if (plan.length > 0)
    result.plan = plan
  if (workingAssumptions.length > 0)
    result.workingAssumptions = workingAssumptions
  if (completionCriteria.length > 0)
    result.completionCriteria = completionCriteria

  // Convergence on done
  if (result.status === 'done') {
    result.blockers = []
    result.nextStep = null
    result.recentFailureReason = null
  }

  return result
}

/**
 * Whether a TaskMemory has enough content to be meaningful.
 */
export function isTaskMemoryVisible(tm: TaskMemory | undefined): boolean {
  if (!tm)
    return false
  return isNonEmptyString(tm.goal)
    || isNonEmptyString(tm.currentStep)
    || tm.confirmedFacts.length > 0
    || tm.artifacts.length > 0
    || tm.blockers.length > 0
    || isNonEmptyString(tm.nextStep)
    || tm.status === 'blocked'
    || tm.status === 'done'
}
