import type { AssistantTurn } from '../messages/types'

/** Default Agent decision-step budget per generated turn. */
export const DEFAULT_MAX_STEPS = 30

/** Control flow for a turn whose last allowed decision step has fully settled. */
export class DecisionStepLimitReached extends Error {
  constructor(
    readonly partialTurn: AssistantTurn,
    readonly maxSteps: number,
    readonly completedSteps: number,
  ) {
    super(`Agent decision step limit reached (${completedSteps}/${maxSteps})`)
  }
}
