/**
 * Budget guard — enforces hard limits on turns, tool calls, and token usage.
 *
 * The guard is checked after each LLM turn. When budget reaches 80%,
 * a "low budget" advisory is injected into the next prompt to guide
 * the LLM toward completing its work. At 100%, the loop is forcibly stopped.
 */

import type { BudgetSnapshot, QueryEngineConfig } from './types'

/** Fraction of budget at which the low-budget advisory kicks in. */
const LOW_BUDGET_THRESHOLD = 0.8

export class BudgetGuard {
  private turnsUsed = 0
  private toolCallsUsed = 0
  private tokensUsed = 0

  private readonly maxTurns: number
  private readonly maxToolCalls: number
  private readonly maxTokenBudget: number

  constructor(config: Pick<QueryEngineConfig, 'maxTurns' | 'maxToolCalls' | 'maxTokenBudget'>) {
    this.maxTurns = config.maxTurns
    this.maxToolCalls = config.maxToolCalls
    this.maxTokenBudget = config.maxTokenBudget
  }

  /** Record one LLM turn. */
  recordTurn(): void {
    this.turnsUsed++
  }

  /** Record N tool calls from a single turn. */
  recordToolCalls(count: number): void {
    this.toolCallsUsed += count
  }

  /** Record token usage from an LLM response. */
  recordTokens(tokens: number): void {
    // NOTICE: Guard against NaN — some providers return partial usage
    // objects where totalTokens is undefined, leading to NaN propagation.
    if (Number.isFinite(tokens)) {
      this.tokensUsed += tokens
    }
  }

  /** Get a snapshot of current budget consumption. */
  snapshot(): BudgetSnapshot {
    const turnPercent = this.maxTurns > 0 ? this.turnsUsed / this.maxTurns : 0
    const toolPercent = this.maxToolCalls > 0 ? this.toolCallsUsed / this.maxToolCalls : 0
    const tokenPercent = this.maxTokenBudget > 0 ? this.tokensUsed / this.maxTokenBudget : 0
    const percentUsed = Math.max(turnPercent, toolPercent, tokenPercent)

    return {
      turnsUsed: this.turnsUsed,
      turnsRemaining: Math.max(0, this.maxTurns - this.turnsUsed),
      toolCallsUsed: this.toolCallsUsed,
      toolCallsRemaining: Math.max(0, this.maxToolCalls - this.toolCallsUsed),
      tokensUsed: this.tokensUsed,
      tokensRemaining: Math.max(0, this.maxTokenBudget - this.tokensUsed),
      percentUsed,
      exhausted: percentUsed >= 1.0,
      nearLimit: percentUsed >= LOW_BUDGET_THRESHOLD && percentUsed < 1.0,
    }
  }

  /**
   * Build a low-budget advisory string, or null if budget is comfortable.
   * Injected as a system message when budget is near the limit.
   */
  buildAdvisory(): string | null {
    const snap = this.snapshot()
    if (!snap.nearLimit)
      return null

    const parts: string[] = [
      '[BUDGET WARNING] You are running low on budget.',
    ]

    if (snap.turnsRemaining <= 5) {
      parts.push(`Only ${snap.turnsRemaining} LLM turns remaining.`)
    }
    if (snap.toolCallsRemaining <= 10) {
      parts.push(`Only ${snap.toolCallsRemaining} tool calls remaining.`)
    }
    if (snap.tokensRemaining < 50_000) {
      parts.push(`Only ~${Math.round(snap.tokensRemaining / 1000)}k tokens remaining.`)
    }

    parts.push('Please wrap up your current work and provide a final summary.')
    return parts.join(' ')
  }
}
