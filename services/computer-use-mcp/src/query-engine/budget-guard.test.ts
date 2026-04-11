import { describe, expect, it } from 'vitest'

import { BudgetGuard } from './budget-guard'

describe('budgetGuard', () => {
  it('starts with zero consumption', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    const snap = guard.snapshot()
    expect(snap.turnsUsed).toBe(0)
    expect(snap.toolCallsUsed).toBe(0)
    expect(snap.tokensUsed).toBe(0)
    expect(snap.percentUsed).toBe(0)
    expect(snap.exhausted).toBe(false)
    expect(snap.nearLimit).toBe(false)
  })

  it('tracks turn consumption', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    guard.recordTurn()
    guard.recordTurn()
    const snap = guard.snapshot()
    expect(snap.turnsUsed).toBe(2)
    expect(snap.turnsRemaining).toBe(8)
    expect(snap.percentUsed).toBeCloseTo(0.2)
  })

  it('tracks tool call consumption', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    guard.recordToolCalls(5)
    guard.recordToolCalls(3)
    const snap = guard.snapshot()
    expect(snap.toolCallsUsed).toBe(8)
    expect(snap.toolCallsRemaining).toBe(42)
  })

  it('tracks token consumption', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    guard.recordTokens(30_000)
    guard.recordTokens(20_000)
    const snap = guard.snapshot()
    expect(snap.tokensUsed).toBe(50_000)
    expect(snap.tokensRemaining).toBe(50_000)
    expect(snap.percentUsed).toBeCloseTo(0.5)
  })

  it('reports exhausted when turns hit limit', () => {
    const guard = new BudgetGuard({ maxTurns: 2, maxToolCalls: 50, maxTokenBudget: 100_000 })
    guard.recordTurn()
    expect(guard.snapshot().exhausted).toBe(false)
    guard.recordTurn()
    expect(guard.snapshot().exhausted).toBe(true)
  })

  it('reports exhausted when tool calls hit limit', () => {
    const guard = new BudgetGuard({ maxTurns: 50, maxToolCalls: 5, maxTokenBudget: 100_000 })
    guard.recordToolCalls(5)
    expect(guard.snapshot().exhausted).toBe(true)
  })

  it('reports exhausted when tokens hit limit', () => {
    const guard = new BudgetGuard({ maxTurns: 50, maxToolCalls: 50, maxTokenBudget: 10_000 })
    guard.recordTokens(10_000)
    expect(guard.snapshot().exhausted).toBe(true)
  })

  it('reports nearLimit at 80% threshold', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    // 8 out of 10 turns = 80%
    for (let i = 0; i < 8; i++) guard.recordTurn()
    const snap = guard.snapshot()
    expect(snap.nearLimit).toBe(true)
    expect(snap.exhausted).toBe(false)
  })

  it('builds advisory when near limit', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 50, maxTokenBudget: 100_000 })
    expect(guard.buildAdvisory()).toBeNull()

    for (let i = 0; i < 8; i++) guard.recordTurn()
    const advisory = guard.buildAdvisory()
    expect(advisory).not.toBeNull()
    expect(advisory).toContain('BUDGET WARNING')
    expect(advisory).toContain('2 LLM turns remaining')
  })

  it('does not build advisory when budget is comfortable', () => {
    const guard = new BudgetGuard({ maxTurns: 50, maxToolCalls: 200, maxTokenBudget: 500_000 })
    guard.recordTurn()
    guard.recordToolCalls(3)
    guard.recordTokens(10_000)
    expect(guard.buildAdvisory()).toBeNull()
  })

  it('uses the highest percentage as the overall percentUsed', () => {
    const guard = new BudgetGuard({ maxTurns: 10, maxToolCalls: 4, maxTokenBudget: 100_000 })
    guard.recordTurn() // 10%
    guard.recordToolCalls(3) // 75% — highest
    guard.recordTokens(5_000) // 5%
    expect(guard.snapshot().percentUsed).toBeCloseTo(0.75)
  })
})
