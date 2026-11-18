import type Stripe from 'stripe'

import type { PaymentReceiptAdapter } from './types'

import { appleIapReceiptAdapter } from './apple-iap'
import { createStripeReceiptAdapter } from './stripe'

export function createPaymentReceiptAdapters(stripe: Stripe | null): ReadonlyMap<string, PaymentReceiptAdapter> {
  return new Map([
    ['stripe', createStripeReceiptAdapter(stripe)],
    ['apple_iap', appleIapReceiptAdapter],
  ])
}
