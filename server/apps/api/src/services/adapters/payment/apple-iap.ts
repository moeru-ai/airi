import type { PaymentReceiptAdapter } from './types'

export const appleIapReceiptAdapter: PaymentReceiptAdapter = {
  toMajorUnits: amount => amount / 1000,
  resolveReceiptUrl: () => 'https://reportaproblem.apple.com/',
}
