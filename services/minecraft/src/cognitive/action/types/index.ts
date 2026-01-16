import type { PlanStep } from '../../../agents/planning/adapter'

export type ActionType = 'sequential' | 'parallel' | 'chat'

export interface BaseActionInstruction {
  type: ActionType
  id?: string
  description?: string
  require_feedback?: boolean
}

export interface SequentialActionInstruction extends BaseActionInstruction {
  type: 'sequential'
  step: PlanStep
}

export interface ParallelActionInstruction extends BaseActionInstruction {
  type: 'parallel'
  step: PlanStep
}

export interface ChatActionInstruction extends BaseActionInstruction {
  type: 'chat'
  message: string
}

export type ActionInstruction = SequentialActionInstruction | ParallelActionInstruction | ChatActionInstruction
