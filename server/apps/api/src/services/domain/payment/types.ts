export type ClaimStatus = 'paid' | 'canceled' | 'expired'

/**
 * Adapter claim for a pending `payment_order`.
 *
 * The Stripe adapter maps a verified processor event onto this receipt.
 * CORE claims by `paymentOrderId`.
 */
export interface ClaimReceipt {
  kind: 'claim'
  processor: string
  paymentOrderId: string
  processorOrderId: string
  status: ClaimStatus
  amount?: number
  currency?: string
  customerId?: string
  extras?: Record<string, unknown>
}

export type SettleResult
  = | { applied: true, userId: string, fluxAmount: number, balanceAfter: number }
    | { applied: false }

/**
 * Adapter request to insert a pending `payment_order`.
 *
 * The adapter resolves the pack. CORE snapshots flux on the row.
 */
export interface OpenPendingInput {
  userId: string
  processor: string
  packKey: string
  fluxAmount: number
  currency?: string
}

export interface PendingPaymentOrder {
  id: string
  /** Live `payment_customer` for this user and processor, when one exists. */
  customerId?: string
}

export interface BindProcessorOrderInput {
  processorOrderId: string
  amount?: number
  currency?: string
}
