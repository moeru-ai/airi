import { describe, expect, it } from 'vitest'

import { SpendingLedger } from './spending'

const HOUR = 60 * 60 * 1000

describe('spending ledger', () => {
  it('counts costs within the window and reports when spending falls under the limit', () => {
    let now = 0
    const ledger = new SpendingLedger({ now: () => now })
    const limit = { amount: 1, currency: 'USD', windowMs: HOUR }

    ledger.record({ amount: 0.6, currency: 'USD' })
    now = 10_000
    ledger.record({ amount: 0.6, currency: 'USD' })
    expect(ledger.check(limit)).toEqual({ spent: 1.2, uncounted: 0, over: true, underAt: HOUR })

    now = HOUR
    expect(ledger.check(limit)).toMatchObject({ spent: 0.6, over: false })
  })

  it('lists requests the limit cannot count', () => {
    const ledger = new SpendingLedger()
    ledger.record(undefined)
    ledger.record({ amount: 5, currency: 'CNY' })

    expect(ledger.check({ amount: 1, currency: 'USD', windowMs: HOUR })).toEqual({ spent: 0, uncounted: 2, over: false })
  })

  it('is never over without a limit', () => {
    const ledger = new SpendingLedger()
    ledger.record({ amount: 100, currency: 'USD' })

    expect(ledger.check(undefined).over).toBe(false)
  })
})
