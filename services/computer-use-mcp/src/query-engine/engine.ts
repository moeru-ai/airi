/**
 * QueryEngine — the autonomous coding loop.
 *
 * Implements the ReAct pattern (think → act → observe → continue):
 * 1. Detect workspace toolchain (package manager, test runner, etc.)
 * 2. Build messages (system prompt + history)
 * 3. Call LLM → get assistant response
 * 4. If assistant has tool_calls → execute tools → collect results → continue
 * 5. If no tool_calls → run post-loop verification → return
 *
 * The engine is MCP-native: it's triggered by a `coding_agentic_run` MCP tool call,
 * and internally uses already-registered CodingPrimitives for all file operations.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { CodingPrimitives } from '../coding/primitives'
import type { TerminalRunner } from '../types'
import type {
  LLMResponse,
  QueryEngineConfig,
  QueryEngineProgress,
  QueryEngineResult,
  QueryMessage,
  ToolCall,
  VerificationRecord,
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

// ─── Toolchain Detection ──────────────────────────────────────────

interface WorkspaceToolchain {
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun'
  testCommand?: string
  typecheckCommand?: string
}

/**
 * Detect workspace toolchain by checking for lockfiles and config files.
 * This gives the LLM accurate commands to run for verification.
 */
function detectToolchain(workspacePath: string): WorkspaceToolchain {
  const exists = (f: string) => existsSync(join(workspacePath, f))

  // Detect package manager
  let packageManager: WorkspaceToolchain['packageManager'] = 'npm'
  if (exists('pnpm-lock.yaml') || exists('pnpm-workspace.yaml')) packageManager = 'pnpm'
  else if (exists('yarn.lock')) packageManager = 'yarn'
  else if (exists('bun.lockb') || exists('bun.lock')) packageManager = 'bun'

  // Detect test runner
  let testCommand: string | undefined
  if (exists('vitest.config.ts') || exists('vitest.config.js') || exists('vitest.config.mts')) {
    testCommand = `${packageManager} exec vitest run`
  }
  else if (exists('jest.config.ts') || exists('jest.config.js')) {
    testCommand = `${packageManager} exec jest --passWithNoTests`
  }

  // Detect typecheck
  let typecheckCommand: string | undefined
  if (exists('tsconfig.json')) {
    typecheckCommand = `${packageManager} exec tsc --noEmit`
  }

  return { packageManager, testCommand, typecheckCommand }
}

// ─── Post-loop Verification ───────────────────────────────────────

/**
 * Run post-loop verification on all files the agent claimed to modify.
 *
 * Checks:
 * 1. File exists and is readable
 * 2. File is valid UTF-8
 * 3. If .ts/.js: no obvious syntax errors (optional typecheck)
 */
async function verifyModifiedFiles(
  filesModified: string[],
  workspacePath: string,
): Promise<VerificationRecord[]> {
  const records: VerificationRecord[] = []
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  for (const filePath of filesModified) {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath)

    // Check 1: file exists
    try {
      await fs.access(absPath)
    }
    catch {
      records.push({
        check: 'file_exists',
        target: filePath,
        passed: false,
        detail: `File does not exist at ${absPath}`,
      })
      continue
    }

    // Check 2: file is readable
    try {
      const content = await fs.readFile(absPath, 'utf-8')
      records.push({
        check: 'file_readable',
        target: filePath,
        passed: true,
        detail: `${content.length} chars, ${content.split('\n').length} lines`,
      })

      // Check 3: basic syntax sanity for TS/JS files
      if (filePath.match(/\.(ts|tsx|js|jsx|mts|mjs)$/)) {
        const syntaxIssues = checkBasicSyntax(content)
        records.push({
          check: 'syntax_sanity',
          target: filePath,
          passed: syntaxIssues.length === 0,
          detail: syntaxIssues.length === 0
            ? 'Basic syntax checks passed'
            : `Issues: ${syntaxIssues.join('; ')}`,
        })
      }
    }
    catch (err) {
      records.push({
        check: 'file_readable',
        target: filePath,
        passed: false,
        detail: `Failed to read: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return records
}

/**
 * Quick syntax sanity checks without a full parser.
 * Catches the most common issues that would fail compilation.
 */
function checkBasicSyntax(content: string): string[] {
  const issues: string[] = []

  // Check balanced brackets/parens/braces
  const counts = { '{': 0, '(': 0, '[': 0 }
  const closers: Record<string, keyof typeof counts> = { '}': '{', ')': '(', ']': '[' }
  // Skip strings and comments for bracket counting
  let inString: string | null = null
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!
    const next = content[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++ }
      continue
    }
    if (inString) {
      if (ch === inString && content[i - 1] !== '\\') inString = null
      continue
    }

    if (ch === '/' && next === '/') { inLineComment = true; continue }
    if (ch === '/' && next === '*') { inBlockComment = true; continue }
    if (ch === '\'' || ch === '"' || ch === '`') { inString = ch; continue }

    if (ch in counts) counts[ch as keyof typeof counts]++
    if (ch in closers) counts[closers[ch]!]--
  }

  if (counts['{'] !== 0) issues.push(`Unbalanced braces: ${counts['{']} unclosed`)
  if (counts['('] !== 0) issues.push(`Unbalanced parens: ${counts['(']} unclosed`)
  if (counts['['] !== 0) issues.push(`Unbalanced brackets: ${counts['[']} unclosed`)

  // Check for common import issues
  if (content.includes('from \'') || content.includes('from "')) {
    // Has imports — check they're at the top or inside functions
    // (this is just a sanity check, not a full linter)
  }

  return issues
}

// ─── LLM API Call ─────────────────────────────────────────────────

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

// ─── Main Loop ────────────────────────────────────────────────────

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

  // ─── Detect workspace toolchain ───
  const toolchain = detectToolchain(workspacePath)

  // Build OpenAI-format tool definitions
  const openaiTools = toolDefs.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))

  // System prompt — now with toolchain info
  const systemPrompt = buildSystemPrompt({
    workspacePath,
    tools: toolDefs,
    maxTurns: config.maxTurns,
    maxToolCalls: config.maxToolCalls,
    packageManager: toolchain.packageManager,
    testCommand: toolchain.testCommand,
    typecheckCommand: toolchain.typecheckCommand,
  })

  // Conversation history
  const messages: QueryMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: goal },
  ]

  let lastAssistantContent = ''

  // Helper to build a result with verification
  const buildResult = async (
    status: QueryEngineResult['status'],
    snap: ReturnType<BudgetGuard['snapshot']>,
    error?: string,
  ): Promise<QueryEngineResult> => {
    // Run post-loop verification on modified files
    const verification = await verifyModifiedFiles(
      Array.from(filesModified),
      workspacePath,
    )

    onProgress?.({
      turn: snap.turnsUsed,
      phase: 'completed',
      budget: snap,
      message: `Verification: ${verification.filter(v => v.passed).length}/${verification.length} checks passed`,
    })

    return {
      status,
      turnsUsed: snap.turnsUsed,
      toolCallsUsed: snap.toolCallsUsed,
      tokensUsed: snap.tokensUsed,
      summary: lastAssistantContent || (error ? `Error: ${error}` : ''),
      filesModified: Array.from(filesModified),
      error,
      verification,
    }
  }

  // ---- Main loop ----
  while (true) {
    // Check abort
    if (config.abortSignal?.aborted) {
      return buildResult('aborted', budget.snapshot())
    }

    // Check budget before calling LLM
    const snap = budget.snapshot()
    if (snap.exhausted) {
      return buildResult('budget_exhausted', snap)
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

      return buildResult('error', snap, message)
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

    // No tool calls → agent is done, run verification and return
    if (response.toolCalls.length === 0) {
      return buildResult('completed', budget.snapshot())
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
      if (toolName === 'write_file' || toolName === 'edit_file') {
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
