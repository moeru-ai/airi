/**
 * Engine unit tests — covers resolveConfig and critical loop behaviors.
 *
 * The main loop (runQueryEngine) depends on live LLM calls, terminal execution,
 * and filesystem operations — making it hard to unit test directly. Instead,
 * we test the key DECISION LOGIC that controls loop termination, nudging,
 * and budget enforcement through exported functions and isolated behavior tests.
 *
 * For integration-level loop tests, see e2e-realworld.ts.
 */

import { describe, expect, it } from 'vitest'

import { resolveConfig } from './engine'

// ─── resolveConfig ──────────────────────────────────────────────

describe('QueryEngine', () => {
  describe('resolveConfig', () => {
    it('uses defaults when no overrides or env vars', () => {
      const config = resolveConfig({
        apiKey: 'test-key',
      })
      expect(config.model).toBe('gpt-4o')
      expect(config.baseURL).toBe('https://api.openai.com/v1')
      expect(config.maxTurns).toBe(50)
      expect(config.maxToolCalls).toBe(200)
      expect(config.maxTokenBudget).toBe(500_000)
      expect(config.approvalMode).toBe('auto')
    })

    it('applies overrides over defaults', () => {
      const config = resolveConfig({
        model: 'claude-sonnet',
        apiKey: 'test-key',
        baseURL: 'https://custom.api.com/v1',
        maxTurns: 10,
        maxToolCalls: 50,
        maxTokenBudget: 100_000,
        approvalMode: 'per_mutation',
      })
      expect(config.model).toBe('claude-sonnet')
      expect(config.baseURL).toBe('https://custom.api.com/v1')
      expect(config.maxTurns).toBe(10)
      expect(config.maxToolCalls).toBe(50)
      expect(config.maxTokenBudget).toBe(100_000)
      expect(config.approvalMode).toBe('per_mutation')
    })

    it('passes through abort signal', () => {
      const controller = new AbortController()
      const config = resolveConfig({
        apiKey: 'test-key',
        abortSignal: controller.signal,
      })
      expect(config.abortSignal).toBe(controller.signal)
    })

    it('passes through fallback model', () => {
      const config = resolveConfig({
        apiKey: 'test-key',
        fallbackModel: 'gpt-4o-mini',
      })
      expect(config.fallbackModel).toBe('gpt-4o-mini')
    })

    it('passes through session config', () => {
      const config = resolveConfig({
        apiKey: 'test-key',
        sessionId: 'test-session-123',
        sessionDir: '/tmp/custom-sessions',
      })
      expect(config.sessionId).toBe('test-session-123')
      expect(config.sessionDir).toBe('/tmp/custom-sessions')
    })
  })
})

// ─── BudgetGuard ──────────────────────────────────────────────

import { BudgetGuard } from './budget-guard'

describe('BudgetGuard', () => {
  it('starts with full budget available', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    const snap = guard.snapshot()
    expect(snap.turnsUsed).toBe(0)
    expect(snap.turnsRemaining).toBe(10)
    expect(snap.exhausted).toBe(false)
    expect(snap.nearLimit).toBe(false)
    expect(snap.percentUsed).toBe(0)
  })

  it('tracks turn consumption correctly', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    guard.recordTurn()
    guard.recordTurn()
    guard.recordTurn()
    const snap = guard.snapshot()
    expect(snap.turnsUsed).toBe(3)
    expect(snap.turnsRemaining).toBe(7)
    expect(snap.percentUsed).toBeCloseTo(0.3, 2)
  })

  it('reports nearLimit at 80% usage', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 100, maxTokenBudget: 100_000 })
    for (let i = 0; i < 8; i++) guard.recordTurn()
    const snap = guard.snapshot()
    expect(snap.nearLimit).toBe(true)
    expect(snap.exhausted).toBe(false)
  })

  it('reports exhausted at 100% usage', () => {
    const guard = new BudgetGuard({ maxTurns: 5, maxToolCalls: 100, maxTokenBudget: 100_000 })
    for (let i = 0; i < 5; i++) guard.recordTurn()
    const snap = guard.snapshot()
    expect(snap.exhausted).toBe(true)
  })

  it('guards against NaN token values', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    guard.recordTokens(NaN)
    guard.recordTokens(undefined as unknown as number)
    guard.recordTokens(Infinity)
    const snap = guard.snapshot()
    // NaN and undefined should be silently ignored; Infinity is finite → also ignored
    expect(snap.tokensUsed).toBe(0)
  })

  it('builds advisory when near limit', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 100, maxTokenBudget: 100_000 })
    // Not near limit yet
    expect(guard.buildAdvisory()).toBeNull()

    // Push to 90% turns
    for (let i = 0; i < 9; i++) guard.recordTurn()
    const advisory = guard.buildAdvisory()
    expect(advisory).not.toBeNull()
    expect(advisory).toContain('BUDGET WARNING')
    expect(advisory).toContain('1 LLM turns remaining')
  })

  it('tracks tool calls independently from turns', () => {
    const guard = new BudgetGuard({ maxTurns: 100, maxToolCalls: 10, maxTokenBudget: 10_000_000 })
    guard.recordToolCalls(8)
    const snap = guard.snapshot()
    expect(snap.toolCallsUsed).toBe(8)
    expect(snap.nearLimit).toBe(true) // 80% of tool calls
    expect(snap.exhausted).toBe(false)
  })

  it('exhaustion is driven by the MOST consumed dimension', () => {
    const guard = new BudgetGuard({ maxTurns: 100, maxToolCalls: 100, maxTokenBudget: 1000 })
    // Tokens are exhausted while turns and tool calls are barely used
    guard.recordTokens(1000)
    guard.recordTurn()
    const snap = guard.snapshot()
    expect(snap.exhausted).toBe(true)
    expect(snap.turnsUsed).toBe(1) // plenty of turns left
  })
})

// ─── Context Compaction ─────────────────────────────────────────

import { compactIfNeeded, estimateMessageTokens } from './context-compact'
import type { QueryMessage } from './types'

describe('contextCompaction', () => {
  it('does NOT compact when under threshold', () => {
    const messages: QueryMessage[] = [
      { role: 'system', content: 'You are a coding agent.' },
      { role: 'user', content: 'Fix the bug.' },
      { role: 'assistant', content: 'I will look at the file.', tool_calls: [] },
    ]
    const result = compactIfNeeded(messages, { compactThreshold: 999_999, preserveRecentCount: 4 })
    expect(result.compacted).toBe(false)
    expect(result.messages).toBe(messages) // same reference = unchanged
  })

  it('compacts when over threshold, preserving system + recent messages', () => {
    // Build a conversation with 20 messages
    const messages: QueryMessage[] = [
      { role: 'system', content: 'System prompt.' },
    ]
    for (let i = 0; i < 18; i++) {
      if (i % 3 === 0) {
        messages.push({ role: 'assistant', content: `Thinking step ${i}...`, tool_calls: [{ id: `tc-${i}`, type: 'function', function: { name: 'read_file', arguments: '{}' } }] })
      }
      else if (i % 3 === 1) {
        messages.push({ role: 'tool', tool_call_id: `tc-${i - 1}`, content: `Result of step ${i}` })
      }
      else {
        messages.push({ role: 'assistant', content: `Analysis ${i}: the code looks fine.`, tool_calls: [] })
      }
    }
    messages.push({ role: 'user', content: 'Now fix it.' })

    const result = compactIfNeeded(messages, { compactThreshold: 50, preserveRecentCount: 4 })
    expect(result.compacted).toBe(true)
    // Should have: system + summary + 4 recent = 6
    expect(result.compactedCount).toBe(6)
    expect(result.messages[0]!.role).toBe('system')
    expect(result.messages[1]!.role).toBe('user') // summary is injected as user message
    expect(result.messages[1]!.content).toContain('Conversation History Summary')
  })

  it('handles undefined content in estimation without errors', () => {
    const messages: QueryMessage[] = [
      { role: 'system', content: 'test' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'x', type: 'function', function: { name: 'foo', arguments: '{}' } }] },
    ]
    // Should not throw
    const tokens = estimateMessageTokens(messages)
    expect(tokens).toBeGreaterThan(0)
  })
})

// ─── Tokenizer ──────────────────────────────────────────────────

import { estimateTokenCount } from './tokenizer'

describe('tokenizer', () => {
  it('returns 0 for empty/null input', () => {
    expect(estimateTokenCount('')).toBe(0)
    expect(estimateTokenCount(null as unknown as string)).toBe(0)
    expect(estimateTokenCount(undefined as unknown as string)).toBe(0)
  })

  it('estimates English text reasonably', () => {
    const text = 'The quick brown fox jumps over the lazy dog.'
    const tokens = estimateTokenCount(text)
    // A 9-word sentence is typically ~10-12 tokens
    expect(tokens).toBeGreaterThanOrEqual(8)
    expect(tokens).toBeLessThanOrEqual(20)
  })

  it('estimates code with camelCase splits', () => {
    const code = 'function getWorkspacePath() { return this.config.workspacePath; }'
    const tokens = estimateTokenCount(code)
    // camelCase words split: getWorkspacePath → get, Workspace, Path
    expect(tokens).toBeGreaterThan(5)
  })

  it('handles CJK characters', () => {
    const cjk = '这是一段中文文本'
    const tokens = estimateTokenCount(cjk)
    // 8 CJK chars × 1.5 ≈ 12 tokens
    expect(tokens).toBeGreaterThanOrEqual(8)
    expect(tokens).toBeLessThanOrEqual(20)
  })

  it('handles large code blocks without overflow', () => {
    const largeFn = Array.from({ length: 500 }, (_, i) => `  const var${i} = computeSomething(${i})`).join('\n')
    const tokens = estimateTokenCount(largeFn)
    // 500 lines of code should be a few thousand tokens
    expect(tokens).toBeGreaterThan(500)
    expect(tokens).toBeLessThan(10_000)
  })
})

// ─── isTransientError edge cases ────────────────────────────────
// Main test suite is in hardening.test.ts — these test specific regressions.

import { isTransientError } from './engine'

describe('isTransientError regressions', () => {
  it('handles empty string', () => {
    expect(isTransientError('')).toBe(false)
  })

  it('real-world server error with JSON body', () => {
    expect(isTransientError('LLM API error (503): {"error":{"message":"Service Unavailable"}}')).toBe(true)
  })

  it('treats mixed auth + network errors as non-retryable (auth wins)', () => {
    // If message contains both 401 AND timeout, auth error is the primary signal
    expect(isTransientError('authentication timeout after 401 response')).toBe(false)
  })

  it('treats "signal aborted" as transient (abort is retriable)', () => {
    expect(isTransientError('AbortError: signal is aborted without reason')).toBe(true)
  })
})
