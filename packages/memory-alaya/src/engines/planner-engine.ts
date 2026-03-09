import type { PlannerRunInput } from '../contracts/v1'
import type { RunPlannerBatchDeps } from '../use-cases/run-planner-batch'
import type {
  ShouldTriggerPlannerInput,
  ShouldTriggerPlannerOutput,
} from '../use-cases/should-trigger-planner'

import { runPlannerBatch } from '../use-cases/run-planner-batch'
import { shouldTriggerPlanner } from '../use-cases/should-trigger-planner'

export interface PlannerEngine {
  run(input: PlannerRunInput): ReturnType<typeof runPlannerBatch>
  shouldTrigger(input: ShouldTriggerPlannerInput): ShouldTriggerPlannerOutput
}

export function createPlannerEngine(deps: RunPlannerBatchDeps): PlannerEngine {
  return {
    run(input) {
      return runPlannerBatch(input, deps)
    },
    shouldTrigger(input) {
      return shouldTriggerPlanner(input)
    },
  }
}
