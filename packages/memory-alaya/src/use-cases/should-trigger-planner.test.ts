import { describe, expect, it } from 'vitest'

import { shouldTriggerPlanner } from './should-trigger-planner'

describe('shouldTriggerPlanner', () => {
  it('runs immediately on manual trigger', () => {
    const result = shouldTriggerPlanner({
      trigger: 'manual',
      now: Date.now(),
      newEffectiveTurns: 0,
      pendingTurns: 0,
    })

    expect(result).toEqual({
      shouldRun: true,
      reason: 'manual',
    })
  })

  it('runs when pending turns exceed hard threshold', () => {
    const result = shouldTriggerPlanner({
      trigger: 'scheduled',
      now: Date.now(),
      newEffectiveTurns: 2,
      pendingTurns: 40,
    })

    expect(result).toEqual({
      shouldRun: true,
      reason: 'hard_threshold',
    })
  })
})
