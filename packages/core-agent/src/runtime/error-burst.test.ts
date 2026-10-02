import type { AgentRun } from './run-table'

import { describe, expect, it } from 'vitest'

import { OWNER_AUDIENCE } from './audience'
import { ERROR_BURST_COOLDOWN_MS, ERROR_BURST_WINDOW_MS, ErrorBurstBreaker } from './error-burst'

function run(state: AgentRun['state']): AgentRun {
  return { runId: 'run', sessionId: 'session', state, queuedAt: 0, envelope: { sessionId: 'session', bindings: [], outputs: [], audience: OWNER_AUDIENCE } }
}

describe('error burst breaker', () => {
  it('cools down after three blocked runs in one window and recovers after the cooldown', () => {
    let now = 0
    const breaker = new ErrorBurstBreaker({ now: () => now })

    breaker.observe(run('blocked'))
    breaker.observe(run('done'))
    breaker.observe(run('expired'))
    breaker.observe(run('blocked'))
    expect(breaker.coolingUntil()).toBeUndefined()
    breaker.observe(run('blocked'))
    expect(breaker.coolingUntil()).toBe(ERROR_BURST_COOLDOWN_MS)

    now = ERROR_BURST_COOLDOWN_MS
    expect(breaker.coolingUntil()).toBeUndefined()
  })

  it('forgets failures outside the window', () => {
    let now = 0
    const breaker = new ErrorBurstBreaker({ now: () => now })

    breaker.observe(run('blocked'))
    breaker.observe(run('blocked'))
    now = ERROR_BURST_WINDOW_MS
    breaker.observe(run('blocked'))

    expect(breaker.coolingUntil()).toBeUndefined()
  })
})
