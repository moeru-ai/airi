import { describe, expect, it } from 'vitest'

import { formatPaymentAmount } from './payment-history'

describe('payment amounts', () => {
  it('keeps absent amounts distinct from free orders', () => {
    expect(formatPaymentAmount(null, 'usd', 'stripe', 'en')).toBeNull()
    expect(formatPaymentAmount(100, null, 'stripe', 'en')).toBeNull()
    expect(formatPaymentAmount(0, 'usd', 'stripe', 'en')).toBe('USD\u00A00.00')
  })

  it('uses Apple milliunits and Stripe currency exceptions', () => {
    expect(formatPaymentAmount(4990, 'usd', 'apple_iap', 'en')).toBe('USD\u00A04.99')
    expect(formatPaymentAmount(6000, 'isk', 'stripe', 'en')).toBe('ISK\u00A060')
    expect(formatPaymentAmount(6000, 'ugx', 'stripe', 'en')).toBe('UGX\u00A060')
    expect(formatPaymentAmount(6000, 'usd', 'unmapped', 'en')).toBeNull()
  })

  it('respects zero, two, and three fraction currencies', () => {
    expect(formatPaymentAmount(6000, 'usd', 'stripe', 'en')).toBe('USD\u00A060.00')
    expect(formatPaymentAmount(6000, 'jpy', 'stripe', 'en')).toBe('JPY\u00A06,000')
    expect(formatPaymentAmount(6000, 'kwd', 'stripe', 'en')).toBe('KWD\u00A06.000')
  })
})
