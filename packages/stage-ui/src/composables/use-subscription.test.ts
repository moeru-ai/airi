import { describe, expect, it } from 'vitest'

import { planRemainingPercent } from './use-subscription'

describe('planRemainingPercent', () => {
  it('returns null when there is no grant', () => {
    expect(planRemainingPercent(undefined)).toBeNull()
    expect(planRemainingPercent(null)).toBeNull()
    expect(planRemainingPercent({ grantedCredit: 0, remainingCredit: 0 })).toBeNull()
  })

  it('rounds the remaining share and caps it at 100', () => {
    expect(planRemainingPercent({ grantedCredit: 2000, remainingCredit: 1440 })).toBe(72)
    expect(planRemainingPercent({ grantedCredit: 2000, remainingCredit: 0 })).toBe(0)
    expect(planRemainingPercent({ grantedCredit: 2000, remainingCredit: 2500 })).toBe(100)
  })
})
