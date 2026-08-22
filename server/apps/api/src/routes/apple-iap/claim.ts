import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library'

import type { EvidenceReceipt } from '../../services/domain/payment'

import { createInternalError } from '../../utils/error'

/**
 * Maps a verified StoreKit 2 transaction onto a CORE evidence receipt.
 *
 * CORE resolves the pack from `productId`. This mapper does not pass flux.
 */
export function evidenceReceiptFromAppleTransaction(
  transaction: JWSTransactionDecodedPayload,
  userId: string,
): EvidenceReceipt {
  const transactionId = transaction.transactionId
  if (!transactionId)
    throw createInternalError('Apple transaction is missing transactionId')

  const productId = transaction.productId
  if (!productId)
    throw createInternalError('Apple transaction is missing productId')

  return {
    kind: 'evidence',
    provider: 'apple_iap',
    providerOrderId: transactionId,
    userId,
    productId,
    amount: transaction.price ?? undefined,
    currency: transaction.currency ?? undefined,
    providerCustomerId: transaction.appAccountToken,
    extras: {
      transactionId,
      originalTransactionId: transaction.originalTransactionId,
      productId,
      bundleId: transaction.bundleId,
      environment: transaction.environment,
      appAccountToken: transaction.appAccountToken,
      purchaseDate: transaction.purchaseDate,
      type: transaction.type,
      webOrderLineItemId: transaction.webOrderLineItemId,
    },
  }
}
