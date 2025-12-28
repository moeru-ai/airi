import type { PlanStep } from '../../agents/planning/adapter'

export type ActionType = 'physical' | 'chat'

export interface BaseActionInstruction {
  type: ActionType
  description?: string
}

export interface PhysicalActionInstruction extends BaseActionInstruction {
  type: 'physical'
  step: PlanStep
}

export interface ChatActionInstruction extends BaseActionInstruction {
  type: 'chat'
  message: string
}

export type ActionInstruction = PhysicalActionInstruction | ChatActionInstruction
