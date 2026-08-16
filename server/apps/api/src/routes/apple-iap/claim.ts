import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library'

import type { EvidenceReceipt } from '../../services/domain/payment'

import { createInternalError } from '../../utils/error'

/**
 * Maps a verified StoreKit 2 transaction onto a CORE evidence receipt.
 *
 * CORE resolves the pack from `productId`. This mapper does not pass flux.
 */
export function evidenceReceiptFromAppleTransaction(input: {
  transaction: JWSTransactionDecodedPayload
  userId: string
}): EvidenceReceipt {
  const transactionId = input.transaction.transactionId
  if (!transactionId)
    throw createInternalError('Apple transaction is missing transactionId')

  const productId = input.transaction.productId
  if (!productId)
    throw createInternalError('Apple transaction is missing productId')

  return {
    kind: 'evidence',
    provider: 'apple_iap',
    providerOrderId: transactionId,
    userId: input.userId,
    productId,
    amount: input.transaction.price ?? undefined,
    currency: input.transaction.currency ?? undefined,
    providerCustomerId: input.transaction.appAccountToken,
    extras: {
      transactionId,
      originalTransactionId: input.transaction.originalTransactionId,
      productId,
      bundleId: input.transaction.bundleId,
      environment: input.transaction.environment,
      appAccountToken: input.transaction.appAccountToken,
      purchaseDate: input.transaction.purchaseDate,
      type: input.transaction.type,
      webOrderLineItemId: input.transaction.webOrderLineItemId,
    },
  }
}
