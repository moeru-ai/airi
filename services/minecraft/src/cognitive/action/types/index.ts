/**
 * Unified action instruction format.
 * All actions are tool invocations with a tool name and parameters.
 */
export interface ActionInstruction {
  tool: string
  params: Record<string, unknown>
}

/**
 * LLM response format for the stateful agent.
 * Legacy JSON response format retained for backward compatibility.
 */
export interface LLMResponse {
  action: ActionInstruction
}

/**
 * PlanStep for action planning - compatible with ActionInstruction
 */
export interface PlanStep {
  description: string
  tool: string
  params: Record<string, unknown>
}
