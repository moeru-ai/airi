import type { AlayaPlannerTrigger } from '../contracts/v1'

import { defaultPlannerTriggerPolicy } from '../contracts/v1'

export interface PlannerTriggerPolicy {
  effectiveTurnsThreshold: number
  hardTurnsThreshold: number
  minTurnsForIdleRun: number
  idleRunAfterMs: number
}

export interface ShouldTriggerPlannerInput {
  trigger: AlayaPlannerTrigger
  now: number
  lastRunAt?: number
  newEffectiveTurns: number
  pendingTurns: number
  policy?: Partial<PlannerTriggerPolicy>
}

export interface ShouldTriggerPlannerOutput {
  shouldRun: boolean
  reason:
    | 'manual'
    | 'hard_threshold'
    | 'effective_threshold'
    | 'idle_threshold'
    | 'insufficient_changes'
}

export function shouldTriggerPlanner(input: ShouldTriggerPlannerInput): ShouldTriggerPlannerOutput {
  const policy: PlannerTriggerPolicy = {
    ...defaultPlannerTriggerPolicy,
    ...input.policy,
  }

  if (input.trigger === 'manual') {
    return { shouldRun: true, reason: 'manual' }
  }

  if (input.pendingTurns >= policy.hardTurnsThreshold) {
    return { shouldRun: true, reason: 'hard_threshold' }
  }

  if (input.newEffectiveTurns >= policy.effectiveTurnsThreshold) {
    return { shouldRun: true, reason: 'effective_threshold' }
  }

  if (
    input.pendingTurns >= policy.minTurnsForIdleRun
    && input.lastRunAt != null
    && input.now - input.lastRunAt >= policy.idleRunAfterMs
  ) {
    return { shouldRun: true, reason: 'idle_threshold' }
  }

  return { shouldRun: false, reason: 'insufficient_changes' }
}
