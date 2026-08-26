/**
 * Unified action instruction format.
 * All actions are tool invocations with a tool name and parameters.
 */
export interface ActionInstruction {
  params: Record<string, unknown>
  tool: string
}

/**
 * PlanStep for action planning - compatible with ActionInstruction
 */
export interface PlanStep {
  description: string
  params: Record<string, unknown>
  tool: string
}
