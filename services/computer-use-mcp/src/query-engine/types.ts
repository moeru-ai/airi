/**
 * QueryEngine types — configuration, turn tracking, and results.
 */

export interface QueryEngineConfig {
  /**
   * LLM model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-20250514').
   * Read from AIRI_AGENT_MODEL env var by default.
   */
  model: string

  /**
   * API key for the LLM provider.
   * Read from AIRI_AGENT_API_KEY env var by default.
   */
  apiKey: string

  /**
   * Base URL for the OpenAI-compatible API endpoint.
   * Read from AIRI_AGENT_BASE_URL env var by default.
   * Default: 'https://api.openai.com/v1'
   */
  baseURL: string

  /** Maximum number of LLM turns (each API call = 1 turn). */
  maxTurns: number

  /** Maximum number of tool calls across all turns. */
  maxToolCalls: number

  /** Maximum total token budget (input + output across all turns). */
  maxTokenBudget: number

  /**
   * Approval mode for mutating operations inside the loop.
   * - 'auto': all tools auto-approved (for CI/headless)
   * - 'per_mutation': mutating ops require external approval callback
   */
  approvalMode: 'auto' | 'per_mutation'

  /** Abort signal for cancellation. */
  abortSignal?: AbortSignal
}

/**
 * A single tool exposed to the LLM via the function calling API.
 */
export interface QueryEngineTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * A message in the query engine conversation history.
 * Uses OpenAI chat format for portability.
 */
export type QueryMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * Result of a single LLM API call.
 */
export interface LLMResponse {
  content: string | null
  toolCalls: ToolCall[]
  finishReason: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Snapshot of budget consumption at any point.
 */
export interface BudgetSnapshot {
  turnsUsed: number
  turnsRemaining: number
  toolCallsUsed: number
  toolCallsRemaining: number
  tokensUsed: number
  tokensRemaining: number
  percentUsed: number
  exhausted: boolean
  nearLimit: boolean
}

/**
 * Result returned when the query engine completes.
 */
export interface QueryEngineResult {
  status: 'completed' | 'budget_exhausted' | 'error' | 'aborted'
  turnsUsed: number
  toolCallsUsed: number
  tokensUsed: number
  summary: string
  filesModified: string[]
  error?: string
  /** Post-loop verification results. Empty if verification was not run. */
  verification: VerificationRecord[]
}

/**
 * Record of a single verification check run after the agent loop completes.
 */
export interface VerificationRecord {
  /** What was checked (e.g., 'file_exists', 'file_readable', 'test_run', 'typecheck') */
  check: string
  /** Target of the check (file path, test command, etc.) */
  target: string
  /** Whether the check passed */
  passed: boolean
  /** Details: command output, error message, etc. */
  detail: string
}

/**
 * Progress event emitted during the query loop.
 */
export interface QueryEngineProgress {
  turn: number
  phase: 'calling_llm' | 'executing_tools' | 'completed' | 'error'
  toolName?: string
  budget: BudgetSnapshot
  message?: string
}
