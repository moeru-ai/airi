import type { PlannerRunInput, PlannerRunOutput } from '../contracts/v1'

export interface PlannerObserver {
  onStart?(input: PlannerRunInput): void | Promise<void>
  onFinish?(output: PlannerRunOutput): void | Promise<void>
}
