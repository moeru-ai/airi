import type { ModelProfile, ModelRequirements, ModelTier } from './model-profile'

import { checkRequirements, MODEL_TIER_RANK } from './model-profile'

/**
 * A named task that a router can serve with another model.
 * The conversation is never a routing task. The user selects the conversation model.
 */
export interface RoutingTask {
  /** For example `classifier`. */
  kind: string
  requirements: ModelRequirements
  /** Lowest user tier that the task accepts. */
  tier: ModelTier
  /** First-token delay that the task needs. A model measured above it is rejected. */
  timingTargetMs?: number
}

/** Results of a task-specific quality test for one model. */
export interface TaskEvidence {
  passed: number
  failed: number
}

/** Fewest quality test results that count as evidence. */
export const MIN_TASK_EVIDENCE = 5
/** Smallest pass rate that counts as evidence. */
export const MIN_TASK_PASS_RATE = 0.8

/** Why a router rejected a candidate. */
export type RoutingRejection = 'requirements' | 'tier' | 'too-slow' | 'no-evidence'

/** A router decision and the facts it used. Hosts keep it as the routing trace. */
export interface RoutingDecision {
  task: string
  chosen: { providerId: string, model: string }
  /** True when the decision kept the configured model. */
  fallback: boolean
  candidates: Array<{ providerId: string, model: string, rejected?: RoutingRejection, firstTokenMs?: number }>
  decidedAt: number
}

function sameModel(a: { providerId: string, model: string }, b: { providerId: string, model: string }) {
  return a.providerId === b.providerId && a.model === b.model
}

function rejectionOf(task: RoutingTask, profile: ModelProfile, evidence: TaskEvidence | undefined): RoutingRejection | undefined {
  if (!checkRequirements(profile, task.requirements).ok)
    return 'requirements'
  if (!profile.tier || MODEL_TIER_RANK[profile.tier] < MODEL_TIER_RANK[task.tier])
    return 'tier'
  if (task.timingTargetMs !== undefined && profile.latency && profile.latency.firstTokenMs > task.timingTargetMs)
    return 'too-slow'
  const results = evidence ? evidence.passed + evidence.failed : 0
  if (!evidence || results < MIN_TASK_EVIDENCE || evidence.passed / results < MIN_TASK_PASS_RATE)
    return 'no-evidence'
  return undefined
}

/**
 * Chooses a model for one named task.
 *
 * Use when:
 * - A task other than the conversation can run on another configured model, and the user enabled routing.
 *
 * Expects:
 * - `candidates` are configured models. `evidence` returns quality test results for the task and model.
 *
 * Returns:
 * - The fastest candidate that meets the requirements, the tier, the timing target, and the evidence bar.
 *   Without such a candidate, the configured model with `fallback`. Price never ranks candidates.
 */
export function routeModel(
  task: RoutingTask,
  configured: { providerId: string, model: string },
  candidates: readonly ModelProfile[],
  evidence: (profile: ModelProfile) => TaskEvidence | undefined,
  now = Date.now(),
): RoutingDecision {
  const reviewed = candidates.map(profile => ({ profile, rejected: rejectionOf(task, profile, evidence(profile)) }))
  const accepted = reviewed
    .filter(entry => !entry.rejected)
    .sort((a, b) => (a.profile.latency?.firstTokenMs ?? Number.POSITIVE_INFINITY) - (b.profile.latency?.firstTokenMs ?? Number.POSITIVE_INFINITY)
      || Number(sameModel(b.profile, configured)) - Number(sameModel(a.profile, configured)))
  const chosen = accepted[0]?.profile
  return {
    task: task.kind,
    chosen: chosen ? { providerId: chosen.providerId, model: chosen.model } : { ...configured },
    fallback: !chosen,
    candidates: reviewed.map(({ profile, rejected }) => ({ providerId: profile.providerId, model: profile.model, rejected, firstTokenMs: profile.latency?.firstTokenMs })),
    decidedAt: now,
  }
}
