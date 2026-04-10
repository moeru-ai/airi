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
import { buildSessionState, loadSession, saveSession } from './session'
import { callLLMStreaming } from './streaming'
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
    fallbackModel: overrides?.fallbackModel ?? process.env.AIRI_AGENT_FALLBACK_MODEL,
    sessionId: overrides?.sessionId,
    sessionDir: overrides?.sessionDir,
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

  // NOTICE: Only detect test/typecheck commands if dependencies are installed.
  // Without node_modules, commands like 'vitest run' and 'tsc --noEmit' will
  // always fail, wasting agent turns on impossible verification.
  const hasDeps = exists('node_modules')

  // Detect test runner (only if deps installed)
  let testCommand: string | undefined
  if (hasDeps) {
    if (exists('vitest.config.ts') || exists('vitest.config.js') || exists('vitest.config.mts')) {
      testCommand = `${packageManager} exec vitest run`
    }
    else if (exists('jest.config.ts') || exists('jest.config.js')) {
      testCommand = `${packageManager} exec jest --passWithNoTests`
    }
  }

  // Detect typecheck (only if deps installed)
  let typecheckCommand: string | undefined
  if (hasDeps && exists('tsconfig.json')) {
    typecheckCommand = `${packageManager} exec tsc --noEmit`
  }

  return { packageManager, testCommand, typecheckCommand }
}

// ─── Transient Error Detection ────────────────────────────────────

/**
 * Patterns that indicate a transient/retryable error.
 * These are network issues, rate limits, or server overload — NOT logic errors.
 */
const TRANSIENT_PATTERNS = [
  // Network errors
  'fetch failed', 'econnreset', 'enotfound', 'etimedout', 'econnrefused',
  'socket hang up', 'network', 'epipe', 'ehostunreach',
  // HTTP status codes indicating server issues
  '429', '502', '503', '500',
  // Timeout/abort
  'timeout', 'aborterror', 'signal',
  // Provider-specific rate limit messages
  'rate_limit', 'capacity', 'overloaded', 'temporarily', 'try again',
  'too many requests', 'server_error',
]

/**
 * Check if an error message indicates a transient/retryable error.
 * Non-transient errors (401, 400, invalid key) should NOT be retried.
 */
export function isTransientError(message: string): boolean {
  const lower = message.toLowerCase()

  // Explicit non-retryable patterns (auth/validation)
  const NON_RETRYABLE = ['401', '403', 'invalid api key', 'invalid_api_key', 'authentication', '400', 'invalid_request']
  if (NON_RETRYABLE.some(p => lower.includes(p))) return false

  return TRANSIENT_PATTERNS.some(p => lower.includes(p))
}

// ─── Tool Result Truncation ───────────────────────────────────────

/**
 * Truncate tool results to prevent context bloat.
 * Keeps head + tail with a truncation notice in between.
 *
 * Different tools get different treatment:
 * - read_file: already truncated by tool-router, this is a final safety net
 * - bash: test output can be very long, keep head+tail
 * - list_files / search_text: can return hundreds of results
 */
const MAX_TOOL_RESULT_CHARS = 8000

function truncateToolResult(content: string, maxChars: number = MAX_TOOL_RESULT_CHARS): string {
  if (content.length <= maxChars) return content

  const headSize = Math.floor(maxChars * 0.7)
  const tailSize = Math.floor(maxChars * 0.2)
  const head = content.slice(0, headSize)
  const tail = content.slice(-tailSize)
  const omitted = content.length - headSize - tailSize
  return `${head}\n\n... [${omitted} chars truncated — showing first ${headSize} and last ${tailSize} chars] ...\n\n${tail}`
}

// ─── Post-loop Verification ───────────────────────────────────────

/**
 * Run post-loop verification on all files the agent claimed to modify.
 *
 * Checks:
 * 1. File exists and is readable
 * 2. File is valid UTF-8
 * 3. If .ts/.js: no obvious syntax errors (with tolerance for parser limits)
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
        const syntaxIssues = checkBasicSyntax(content, filePath)
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
 *
 * Improved to handle:
 * - Template literals (backtick strings with ${} interpolation)
 * - Regex literals (/pattern/) — brackets inside don't count
 * - Tolerance threshold — small imbalances (≤2) are ignored since our
 *   lightweight parser can't handle every JS edge case (JSX, etc.)
 */
function checkBasicSyntax(content: string, filePath?: string): string[] {
  // NOTICE: JSON files get dedicated parsing; md/txt skip entirely
  const ext = filePath?.split('.').pop()?.toLowerCase()
  if (ext === 'json') {
    try { JSON.parse(content); return [] }
    catch (e) { return [`Invalid JSON: ${(e as Error).message}`] }
  }
  if (ext === 'md' || ext === 'txt' || ext === 'css' || ext === 'html') return []

  const issues: string[] = []
  const counts = { '{': 0, '(': 0, '[': 0 }
  const closers: Record<string, keyof typeof counts> = { '}': '{', ')': '(', ']': '[' }

  let inString: string | null = null
  let inLineComment = false
  let inBlockComment = false
  let inTemplateLiteral = false
  let templateBraceDepth = 0 // Track ${} nesting inside template literals
  let inRegex = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!
    const next = content[i + 1]
    const prev = i > 0 ? content[i - 1] : ''

    // Line comment
    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    // Block comment
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++ }
      continue
    }
    // Regular string ('...' or "...")
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null
      continue
    }
    // Regex literal
    if (inRegex) {
      if (ch === '/' && prev !== '\\') inRegex = false
      continue
    }
    // Template literal with ${} interpolation
    if (inTemplateLiteral) {
      if (ch === '`' && prev !== '\\') {
        inTemplateLiteral = false
        continue
      }
      if (ch === '$' && next === '{') {
        templateBraceDepth++
        i++ // skip the {
        counts['{']++ // the ${ still opens a brace
        continue
      }
      continue // skip all other chars inside template literal text
    }

    // Enter comments
    if (ch === '/' && next === '/') { inLineComment = true; continue }
    if (ch === '/' && next === '*') { inBlockComment = true; continue }
    // Enter strings
    if (ch === '\'' || ch === '"') { inString = ch; continue }
    // Enter template literal
    if (ch === '`') { inTemplateLiteral = true; continue }
    // Enter regex (heuristic: / after = , ( , [ , ! , & , | , ; , { , } , , , : , return , case)
    if (ch === '/' && next !== '/' && next !== '*') {
      const prevNonSpace = content.slice(Math.max(0, i - 10), i).trimEnd().slice(-1)
      if ('=([!&|;{},:\n'.includes(prevNonSpace) || prevNonSpace === '') {
        inRegex = true
        continue
      }
    }

    // Track braces inside template interpolation
    if (templateBraceDepth > 0) {
      if (ch === '{') templateBraceDepth++
      if (ch === '}') {
        templateBraceDepth--
        if (templateBraceDepth === 0) {
          counts['{']-- // closing the ${ brace
          inTemplateLiteral = true // back to template text
          continue
        }
      }
    }

    if (ch in counts) counts[ch as keyof typeof counts]++
    if (ch in closers) counts[closers[ch]!]--
  }

  // NOTICE: Tolerance threshold — our parser can't handle every edge case
  // (JSX tags, regex with brackets, uncommon escape sequences).
  // Small imbalances (≤2) are likely parser artifacts, not real bugs.
  const TOLERANCE = 2
  if (Math.abs(counts['{']) > TOLERANCE) issues.push(`Unbalanced braces: ${counts['{']} unclosed`)
  if (Math.abs(counts['(']) > TOLERANCE) issues.push(`Unbalanced parens: ${counts['(']} unclosed`)
  if (Math.abs(counts['[']) > TOLERANCE) issues.push(`Unbalanced brackets: ${counts['[']} unclosed`)

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

  // ─── Retry state ───
  const MAX_LLM_RETRIES = 5
  const LLM_RETRY_BASE_MS = 1000
  let consecutiveRetries = 0

  // ─── Model fallback state ───
  let currentModel = config.model
  let usedFallback = false

  // ─── Exploration phase tracking ───
  const DISCOVER_LIMIT = Math.min(4, Math.floor(config.maxTurns * 0.25))
  let turnsWithoutEdit = 0
  let anyEditMade = false

  // ─── Continuation tracking ───
  // NOTICE: Agents sometimes respond with thinking/planning text before
  // calling tools. We nudge them to continue instead of exiting immediately.
  // Exit only when: already made edits (summarizing), or 3x consecutive
  // text-only rounds (genuinely stuck/done).
  let consecutiveNoToolCalls = 0
  const MAX_NO_TOOL_ROUNDS = 3

  // ─── Read cache ───
  // Caches read_file results keyed by "filePath:startLine:endLine".
  // Invalidated when the file is modified via edit_file/multi_edit_file/write_file.
  const readCache = new Map<string, string>()
  // Caches list_files results to avoid re-listing the same directory.
  const listCache = new Map<string, number>()

  // ─── Session state ───
  const sessionId = config.sessionId ?? crypto.randomUUID()

  // Restore session if one exists
  if (config.sessionId) {
    const saved = await loadSession(config.sessionId, config.sessionDir)
    if (saved && saved.status === 'in_progress') {
      // Restore conversation state
      messages.length = 0
      messages.push(...saved.messages)
      for (const f of saved.filesModified) filesModified.add(f)
      lastAssistantContent = saved.lastAssistantContent
      anyEditMade = saved.anyEditMade
      turnsWithoutEdit = saved.turnsWithoutEdit
      // Restore budget
      for (let i = 0; i < saved.turnsUsed; i++) budget.recordTurn()
      budget.recordToolCalls(saved.toolCallsUsed)
      budget.recordTokens(saved.tokensUsed)
      onProgress?.({
        turn: saved.turnsUsed,
        phase: 'session_saved' as any,
        budget: budget.snapshot(),
        message: `Session restored: ${saved.turnsUsed} turns, ${saved.tokensUsed} tokens`,
      })
    }
  }

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
      sessionId,
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

    // Call LLM with exponential backoff retry and model fallback
    let response: LLMResponse
    try {
      // Use streaming variant for real-time output
      const callConfig = { ...config, model: currentModel }
      response = await callLLMStreaming({
        config: callConfig,
        messages: messagesForCall,
        tools: openaiTools,
        onDelta: (delta) => {
          onProgress?.({
            turn: snap.turnsUsed + 1,
            phase: 'streaming',
            budget: snap,
            delta,
          })
        },
      })
      consecutiveRetries = 0 // Reset on success
      if (usedFallback) {
        // Switch back to primary model after fallback succeeds
        currentModel = config.model
        usedFallback = false
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      if (isTransientError(message) && consecutiveRetries < MAX_LLM_RETRIES) {
        consecutiveRetries++
        const delay = LLM_RETRY_BASE_MS * Math.pow(2, consecutiveRetries - 1) + Math.random() * 500
        onProgress?.({
          turn: snap.turnsUsed,
          phase: 'retrying',
          budget: snap,
          message: `Transient error, retry ${consecutiveRetries}/${MAX_LLM_RETRIES} in ${Math.round(delay)}ms: ${message.slice(0, 100)}`,
        })
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      // Model fallback: if primary is exhausted, try fallback model
      if (config.fallbackModel && currentModel !== config.fallbackModel && isTransientError(message)) {
        currentModel = config.fallbackModel
        usedFallback = true
        consecutiveRetries = 0
        onProgress?.({
          turn: snap.turnsUsed,
          phase: 'retrying',
          budget: snap,
          message: `Primary model failed, falling back to ${config.fallbackModel}`,
        })
        continue
      }

      // Save session before giving up on error
      if (config.sessionId) {
        const state = buildSessionState({
          sessionId,
          goal,
          workspacePath,
          messages,
          filesModified,
          turnsUsed: snap.turnsUsed,
          toolCallsUsed: snap.toolCallsUsed,
          tokensUsed: snap.tokensUsed,
          anyEditMade,
          turnsWithoutEdit,
          lastAssistantContent,
          status: 'error',
        })
        await saveSession(state, config.sessionDir)
      }

      return buildResult('error', snap, message)
    }

    // Record budget consumption
    budget.recordTurn()
    if (response.usage) {
      budget.recordTokens(response.usage.totalTokens)
    }
    else {
      // NOTICE: Streaming mode may not return usage stats from all providers.
      // Estimate tokens from message content as a fallback for budget tracking.
      const { estimateTokenCount } = await import('./tokenizer')
      const promptTokens = messagesForCall.reduce((sum, m) => {
        const content = m.role === 'assistant'
          ? (m.content ?? '') + (m.tool_calls ? JSON.stringify(m.tool_calls) : '')
          : (m.content ?? '')
        return sum + estimateTokenCount(content)
      }, 0)
      const completionTokens = estimateTokenCount(response.content ?? '')
        + (response.toolCalls.length > 0 ? estimateTokenCount(JSON.stringify(response.toolCalls)) : 0)
      budget.recordTokens(promptTokens + completionTokens)
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

    // No tool calls → agent might be done, OR just thinking/planning
    if (response.toolCalls.length === 0) {
      consecutiveNoToolCalls++

      // If the agent has already made edits and is now summarizing, it's truly done.
      // If it has given MAX_NO_TOOL_ROUNDS consecutive text-only responses, give up.
      if (anyEditMade || consecutiveNoToolCalls >= MAX_NO_TOOL_ROUNDS) {
        return buildResult('completed', budget.snapshot())
      }

      // Context-aware nudge: tell the agent specifically what to do next
      const lastContent = (response.content ?? '').toLowerCase()
      let nudge: string
      if (lastContent.includes('plan') || lastContent.includes('would') || lastContent.includes('should')) {
        nudge = `[System] You described a plan but did not call any tools. Stop planning and start executing. Call edit_file, write_file, read_file, or search_text right now. (${consecutiveNoToolCalls}/${MAX_NO_TOOL_ROUNDS} text-only rounds used)`
      }
      else if (filesModified.size === 0 && budget.snapshot().turnsUsed > 2) {
        nudge = `[System] You have used ${budget.snapshot().turnsUsed} turns but haven't modified any files yet. Call edit_file or write_file now to make changes, or call read_file/search_text if you need more information. (${consecutiveNoToolCalls}/${MAX_NO_TOOL_ROUNDS} text-only rounds used)`
      }
      else {
        nudge = `[System] You responded with text but did not call any tools. The task is NOT complete. Call tools now — do not just describe what you would do. (${consecutiveNoToolCalls}/${MAX_NO_TOOL_ROUNDS} text-only rounds used)`
      }
      messages.push({ role: 'user' as const, content: nudge })
      continue
    }

    // Got tool calls — reset counter
    consecutiveNoToolCalls = 0

    // Execute tool calls — parallel for read-only, serialized for mutations
    budget.recordToolCalls(response.toolCalls.length)

    // Classify tools into read-only (parallelizable) and mutating (serialized)
    const MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'multi_edit_file', 'bash'])

    // Track file modifications (before execution)
    for (const toolCall of response.toolCalls) {
      const toolName = toolCall.function.name
      if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'multi_edit_file') {
        try {
          const args = JSON.parse(toolCall.function.arguments)
          if (args.file_path) filesModified.add(args.file_path)
        }
        catch { /* ignore parse errors for tracking */ }
      }
      // NOTICE: Track file modifications via bash commands too.
      // Agents sometimes use sed/echo/cat to modify files instead of edit_file.
      if (toolName === 'bash') {
        try {
          const args = JSON.parse(toolCall.function.arguments)
          const cmd = (args.command as string) || ''
          // Detect common file-mutating shell commands
          const bashFilePatterns = [
            /\bsed\s+.*?-i['"]*\s+.*?(\S+)\s*$/,         // sed -i 'expr' file
            /\bsed\s+.*?-i['"]*\s+.*?['"].*?['"]\s+(\S+)/, // sed -i 's/x/y/' file
            />\s*(\S+)/,                                      // echo > file / cat > file
            /\btee\s+(?:-a\s+)?(\S+)/,                       // tee file / tee -a file
          ]
          for (const pat of bashFilePatterns) {
            const m = cmd.match(pat)
            if (m?.[1]) {
              const { isAbsolute, resolve } = await import('node:path')
              const target = isAbsolute(m[1]) ? m[1] : resolve(workspacePath, m[1])
              filesModified.add(target)
            }
          }
        }
        catch { /* ignore parse errors for tracking */ }
      }
    }

    // Split into parallel-safe and sequential batches
    // Strategy: collect consecutive read-only calls into a parallel batch,
    // then execute each mutating call individually.
    type PendingCall = { toolCall: ToolCall; index: number }
    const readOnlyBatch: PendingCall[] = []
    const orderedResults: Array<{ toolCallId: string; content: string }> = []

    // Pre-allocate result slots
    const resultSlots = new Array<{ toolCallId: string; content: string } | null>(response.toolCalls.length).fill(null)

    // Helper to execute a single tool call and store the result
    const execOne = async (tc: ToolCall, slotIndex: number) => {
      onProgress?.({
        turn: budget.snapshot().turnsUsed,
        phase: 'executing_tools',
        toolName: tc.function.name,
        budget: budget.snapshot(),
      })

      const { result, error } = await executeToolCall(
        routes,
        tc.function.name,
        tc.function.arguments,
      )

      resultSlots[slotIndex] = {
        toolCallId: tc.id,
        content: error ? `[ERROR] ${result}` : result,
      }
    }

    // Flush any pending read-only batch in parallel
    const flushReadOnly = async () => {
      if (readOnlyBatch.length === 0) return
      await Promise.all(readOnlyBatch.map(p => execOne(p.toolCall, p.index)))
      readOnlyBatch.length = 0
    }

    // Process tool calls maintaining order for mutations
    for (let i = 0; i < response.toolCalls.length; i++) {
      const toolCall = response.toolCalls[i]!
      const isMutating = MUTATING_TOOLS.has(toolCall.function.name)

      if (isMutating) {
        // Flush any pending reads first, then run this mutation
        await flushReadOnly()
        await execOne(toolCall, i)
      }
      else {
        // Accumulate read-only calls for parallel execution
        readOnlyBatch.push({ toolCall, index: i })
      }
    }

    // Flush any remaining read-only calls
    await flushReadOnly()

    // Append all results to history in original order, with truncation + read cache
    for (let idx = 0; idx < resultSlots.length; idx++) {
      const slot = resultSlots[idx]
      if (slot) {
        const toolName = response.toolCalls[idx]?.function.name ?? ''
        let content = truncateToolResult(slot.content)

        // Read cache: if this is a read_file result, cache it
        if (toolName === 'read_file' && !content.startsWith('[ERROR]')) {
          try {
            const args = JSON.parse(response.toolCalls[idx]!.function.arguments)
            const cacheKey = `${args.file_path}:${args.start_line ?? ''}:${args.end_line ?? ''}`
            const cached = readCache.get(cacheKey)
            if (cached === content) {
              // Exact same content — replace with cache hit notice
              content = `[cached — same as previous read of ${args.file_path}]`
            }
            else {
              readCache.set(cacheKey, content)
            }
          }
          catch { /* ignore parse errors */ }
        }

        // Invalidate cache when files are edited
        if (toolName === 'edit_file' || toolName === 'multi_edit_file' || toolName === 'write_file') {
          try {
            const args = JSON.parse(response.toolCalls[idx]!.function.arguments)
            if (args.file_path) {
              // Remove all cache entries for this file
              for (const key of readCache.keys()) {
                if (key.startsWith(args.file_path + ':')) {
                  readCache.delete(key)
                }
              }
            }
          }
          catch { /* ignore */ }
        }

        // NOTICE: list_files dedup — when agent calls list_files on the same
        // directory twice, return a short stub instead of the full listing.
        // This saves significant tokens in exploration-heavy scenarios.
        if (toolName === 'list_files' && !content.startsWith('[ERROR]')) {
          try {
            const args = JSON.parse(response.toolCalls[idx]!.function.arguments)
            const cacheKey = `list:${args.pattern ?? ''}:${args.exclude_patterns ?? ''}`
            const cachedLen = listCache.get(cacheKey)
            if (cachedLen != null) {
              content = `[already listed — ${cachedLen} entries. Use search_text to find specific files instead of re-listing.]`
            }
            else {
              // Estimate entry count from the result
              const lineCount = content.split('\n').filter(Boolean).length
              listCache.set(cacheKey, lineCount)
            }
          }
          catch { /* ignore */ }
        }

        messages.push({
          role: 'tool',
          tool_call_id: slot.toolCallId,
          content,
        })
      }
    }

    // ─── Exploration phase enforcement ───
    // Track whether the agent made any edits this turn.
    const EDIT_TOOLS = new Set(['edit_file', 'multi_edit_file', 'write_file'])
    const madeEditThisTurn = response.toolCalls.some(tc => EDIT_TOOLS.has(tc.function.name))
    if (madeEditThisTurn) {
      anyEditMade = true
      turnsWithoutEdit = 0
    }
    else {
      turnsWithoutEdit++
    }

    // If agent has been exploring too long without editing, inject a nudge
    if (!anyEditMade && turnsWithoutEdit >= DISCOVER_LIMIT) {
      messages.push({
        role: 'system',
        content: `PHASE WARNING: You have spent ${turnsWithoutEdit} turns exploring without making any edits. `
          + 'You must now either (1) make an edit using edit_file/multi_edit_file, or (2) provide your final summary if the task is investigation-only. '
          + 'Do NOT continue searching or reading files without a concrete action plan.',
      })
    }

    // ─── Session auto-save ───
    // Save session state every 5 turns for crash recovery
    if (config.sessionId && budget.snapshot().turnsUsed % 5 === 0) {
      const snap2 = budget.snapshot()
      const state = buildSessionState({
        sessionId,
        goal,
        workspacePath,
        messages,
        filesModified,
        turnsUsed: snap2.turnsUsed,
        toolCallsUsed: snap2.toolCallsUsed,
        tokensUsed: snap2.tokensUsed,
        anyEditMade,
        turnsWithoutEdit,
        lastAssistantContent,
        status: 'in_progress',
      })
      await saveSession(state, config.sessionDir)
      onProgress?.({
        turn: snap2.turnsUsed,
        phase: 'session_saved',
        budget: snap2,
        message: `Session auto-saved (turn ${snap2.turnsUsed})`,
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
