/**
 * QueryEngine — the autonomous coding loop.
 *
 * Implements the ReAct pattern (think → act → observe → continue):
 * 1. Build messages (system prompt + history)
 * 2. Call LLM → get assistant response
 * 3. If assistant has tool_calls → execute tools → collect results → continue
 * 4. If no tool_calls → done, return final response
 *
 * The engine is MCP-native: it's triggered by a `coding_agentic_run` MCP tool call,
 * and internally uses already-registered CodingPrimitives for all file operations.
 */

import type { CodingPrimitives } from '../coding/primitives'
import type { TerminalRunner } from '../types'
import type {
  LLMResponse,
  QueryEngineConfig,
  QueryEngineProgress,
  QueryEngineResult,
  QueryMessage,
  ToolCall,
} from './types'

import { BudgetGuard } from './budget-guard'
import { compactIfNeeded } from './context-compact'
import { buildSystemPrompt } from './system-prompt'
import {
  buildToolRoutes,
  executeToolCall,
  getToolDefinitions,
} from './tool-router'

/**
 * Default configuration values.
 */
const DEFAULTS = {
  maxTurns: 50,
  maxToolCalls: 200,
  maxTokenBudget: 500_000,
  baseURL: 'https://api.openai.com/v1',
  approvalMode: 'auto' as const,
} satisfies Partial<QueryEngineConfig>

/**
 * Build a QueryEngineConfig from environment variables with optional overrides.
 */
export function resolveConfig(overrides?: Partial<QueryEngineConfig>): QueryEngineConfig {
  return {
    model: overrides?.model ?? process.env.AIRI_AGENT_MODEL ?? 'gpt-4o',
    apiKey: overrides?.apiKey ?? process.env.AIRI_AGENT_API_KEY ?? '',
    baseURL: overrides?.baseURL ?? process.env.AIRI_AGENT_BASE_URL ?? DEFAULTS.baseURL,
    maxTurns: overrides?.maxTurns ?? DEFAULTS.maxTurns,
    maxToolCalls: overrides?.maxToolCalls ?? DEFAULTS.maxToolCalls,
    maxTokenBudget: overrides?.maxTokenBudget ?? DEFAULTS.maxTokenBudget,
    approvalMode: overrides?.approvalMode ?? DEFAULTS.approvalMode,
    abortSignal: overrides?.abortSignal,
  }
}

/**
 * Call an OpenAI-compatible chat completions API.
 * Uses native fetch — no external SDK dependency.
 */
async function callLLM(params: {
  config: QueryEngineConfig
  messages: QueryMessage[]
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
}): Promise<LLMResponse> {
  const { config, messages, tools } = params

  if (!config.apiKey) {
    throw new Error(
      'AIRI_AGENT_API_KEY is not set. The QueryEngine requires an API key to call the LLM. '
      + 'Set it via environment variable or pass it in the config.',
    )
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: config.abortSignal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error')
    throw new Error(`LLM API error (${response.status}): ${errorText.slice(0, 500)}`)
  }

  const data = await response.json() as {
    choices: Array<{
      message: {
        content: string | null
        tool_calls?: ToolCall[]
      }
      finish_reason: string
    }>
    usage?: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }
  }

  const choice = data.choices?.[0]
  if (!choice) {
    throw new Error('LLM API returned empty choices array')
  }

  return {
    content: choice.message.content,
    toolCalls: choice.message.tool_calls ?? [],
    finishReason: choice.finish_reason,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  }
}

/**
 * Run the autonomous coding loop.
 *
 * @param goal - The user's task description
 * @param workspacePath - Absolute path to the workspace root
 * @param primitives - CodingPrimitives instance for file operations
 * @param terminal - Terminal runner for shell commands
 * @param config - Engine configuration (resolved from env + overrides)
 * @param onProgress - Optional progress callback
 */
export async function runQueryEngine(params: {
  goal: string
  workspacePath: string
  primitives: CodingPrimitives
  terminal: TerminalRunner
  config: QueryEngineConfig
  onProgress?: (event: QueryEngineProgress) => void
}): Promise<QueryEngineResult> {
  const { goal, workspacePath, primitives, terminal, config, onProgress } = params

  const budget = new BudgetGuard(config)
  const routes = buildToolRoutes({ primitives, terminal, workspacePath })
  const toolDefs = getToolDefinitions()
  const filesModified = new Set<string>()

  // Build OpenAI-format tool definitions
  const openaiTools = toolDefs.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))

  // System prompt
  const systemPrompt = buildSystemPrompt({
    workspacePath,
    tools: toolDefs,
    maxTurns: config.maxTurns,
    maxToolCalls: config.maxToolCalls,
  })

  // Conversation history
  const messages: QueryMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: goal },
  ]

  let lastAssistantContent = ''

  // ---- Main loop ----
  while (true) {
    // Check abort
    if (config.abortSignal?.aborted) {
      return {
        status: 'aborted',
        turnsUsed: budget.snapshot().turnsUsed,
        toolCallsUsed: budget.snapshot().toolCallsUsed,
        tokensUsed: budget.snapshot().tokensUsed,
        summary: lastAssistantContent || 'Aborted before completion.',
        filesModified: Array.from(filesModified),
      }
    }

    // Check budget before calling LLM
    const snap = budget.snapshot()
    if (snap.exhausted) {
      return {
        status: 'budget_exhausted',
        turnsUsed: snap.turnsUsed,
        toolCallsUsed: snap.toolCallsUsed,
        tokensUsed: snap.tokensUsed,
        summary: lastAssistantContent || 'Budget exhausted before completion.',
        filesModified: Array.from(filesModified),
      }
    }

    // Inject low-budget advisory if approaching limit
    const advisory = budget.buildAdvisory()
    const messagesForCall = advisory
      ? [...messages, { role: 'system' as const, content: advisory }]
      : messages

    // Report progress
    onProgress?.({
      turn: snap.turnsUsed + 1,
      phase: 'calling_llm',
      budget: snap,
    })

    // Call LLM
    let response: LLMResponse
    try {
      response = await callLLM({ config, messages: messagesForCall, tools: openaiTools })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      // Retry up to 3 times on transient errors
      if (snap.turnsUsed < 3 && (message.includes('429') || message.includes('503') || message.includes('timeout'))) {
        await new Promise(r => setTimeout(r, 2000 * (snap.turnsUsed + 1)))
        continue
      }

      return {
        status: 'error',
        turnsUsed: snap.turnsUsed,
        toolCallsUsed: snap.toolCallsUsed,
        tokensUsed: snap.tokensUsed,
        summary: lastAssistantContent || '',
        filesModified: Array.from(filesModified),
        error: message,
      }
    }

    // Record budget consumption
    budget.recordTurn()
    if (response.usage) {
      budget.recordTokens(response.usage.totalTokens)
    }

    // Append assistant message to history
    if (response.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      })
    }
    else {
      messages.push({
        role: 'assistant',
        content: response.content ?? '',
      })
    }

    if (response.content) {
      lastAssistantContent = response.content
    }

    // No tool calls → done
    if (response.toolCalls.length === 0) {
      const finalSnap = budget.snapshot()
      return {
        status: 'completed',
        turnsUsed: finalSnap.turnsUsed,
        toolCallsUsed: finalSnap.toolCallsUsed,
        tokensUsed: finalSnap.tokensUsed,
        summary: lastAssistantContent,
        filesModified: Array.from(filesModified),
      }
    }

    // Execute tool calls
    budget.recordToolCalls(response.toolCalls.length)

    for (const toolCall of response.toolCalls) {
      const toolName = toolCall.function.name

      onProgress?.({
        turn: budget.snapshot().turnsUsed,
        phase: 'executing_tools',
        toolName,
        budget: budget.snapshot(),
      })

      // Track file modifications
      if (toolName === 'write_file') {
        try {
          const args = JSON.parse(toolCall.function.arguments)
          if (args.file_path) filesModified.add(args.file_path)
        }
        catch { /* ignore parse errors for tracking */ }
      }

      const { result, error } = await executeToolCall(
        routes,
        toolName,
        toolCall.function.arguments,
      )

      // Append tool result to history
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: error ? `[ERROR] ${result}` : result,
      })
    }

    // Context compaction — compress history when approaching token limit.
    // Run after all tool results are collected, before the next LLM call.
    const compactResult = compactIfNeeded(messages, {
      compactThreshold: Math.floor(config.maxTokenBudget * 0.7),
      preserveRecentCount: 10,
    })
    if (compactResult.compacted) {
      messages.length = 0
      messages.push(...compactResult.messages)
      onProgress?.({
        turn: budget.snapshot().turnsUsed,
        phase: 'calling_llm',
        budget: budget.snapshot(),
        message: `Context compacted: ${compactResult.originalCount} → ${compactResult.compactedCount} messages (${compactResult.estimatedTokensBefore} → ${compactResult.estimatedTokensAfter} estimated tokens)`,
      })
    }
  }
}
