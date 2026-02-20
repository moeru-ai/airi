/**
 * Unified action instruction format.
 * All actions are tool invocations with a tool name and parameters.
 */
export interface ActionInstruction {
  tool: string
  params: Record<string, unknown>
}

/**
 * PlanStep for action planning - compatible with ActionInstruction
 */
export interface PlanStep {
  description: string
  tool: string
  params: Record<string, unknown>
}
