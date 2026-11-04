import type { ReceiptResolver } from '../../domain/payment/receipt'

/** Apple exposes account purchase history without a documented URL for an individual transaction. */
export const appleReceiptResolver: ReceiptResolver = {
  processor: 'apple_iap',
  async resolveReceipt() {
    return { url: 'https://reportaproblem.apple.com/' }
  },
}
