import type { PaymentService } from '../../../services/domain/payment'
import type { Verifier } from '../verifier'

import { Type } from '@apple/app-store-server-library'
import { useLogger } from '@guiiai/logg'
import { v5 as uuidv5 } from 'uuid'
import { safeParse } from 'valibot'

import {
  ApiError,
  createBadRequestError,
  createServiceUnavailableError,
} from '../../../utils/error'
import { evidenceReceiptFromTransaction } from '../claim'
import { SubmitTransactionBodySchema } from '../schema'

const logger = useLogger('apple-iap.transactions')

/**
 * Namespace UUID used to derive a deterministic `appAccountToken` from the
 * authenticated user id via uuid v5.
 *
 * The iOS client derives the same token before StoreKit purchase. Do not rotate
 * this value without a coordinated client and server release.
 */
export const APPLE_IAP_NAMESPACE_UUID = 'f4e8a0c2-2c6b-4e1b-b2a5-6d7f3b5a8c91' as const

/**
 * Verifies a client-posted StoreKit 2 JWS and settles evidence with CORE.
 *
 * Server contract for the native client:
 * - 2xx or 4xx: the client can finish the StoreKit transaction (ack).
 * - 5xx: the client must keep the transaction unfinished and retry later.
 *
 * Auto-renewable subscriptions are rejected until the subscription PR lands.
 */
export function createTransactionOperation(
  payment: PaymentService,
  verifier: Verifier | null,
) {
  return async (userId: string, body: unknown) => {
    if (!verifier)
      throw createServiceUnavailableError('Apple IAP is not configured', 'APPLE_IAP_DISABLED')

    const parsed = safeParse(SubmitTransactionBodySchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid transaction body', 'INVALID_REQUEST', parsed.issues)

    const payload = await verifier.verifyTransaction(parsed.output.signedTransaction)

    if (!payload.transactionId)
      throw createBadRequestError('Transaction payload missing transactionId', 'MISSING_TRANSACTION_ID')
    if (!payload.productId)
      throw createBadRequestError('Transaction payload missing productId', 'MISSING_PRODUCT_ID')
    if (!payload.originalTransactionId) {
      throw createBadRequestError(
        'Transaction payload missing originalTransactionId',
        'MISSING_ORIGINAL_TRANSACTION_ID',
      )
    }

    const expectedToken = uuidv5(userId, APPLE_IAP_NAMESPACE_UUID)
    if (!payload.appAccountToken || payload.appAccountToken.toLowerCase() !== expectedToken.toLowerCase()) {
      logger.withFields({
        userId,
        transactionId: payload.transactionId,
        actual: payload.appAccountToken,
      }).warn('appAccountToken mismatch')
      throw new ApiError(403, 'ACCOUNT_TOKEN_MISMATCH', 'appAccountToken does not match authenticated user')
    }

    if (payload.type === Type.AUTO_RENEWABLE_SUBSCRIPTION) {
      throw createBadRequestError(
        'Apple subscription products are not supported yet',
        'SUBSCRIPTION_NOT_SUPPORTED',
        { productId: payload.productId },
      )
    }

    const receipt = evidenceReceiptFromTransaction(payload, userId)
    const result = await payment.settle(receipt)

    logger.withFields({
      userId,
      transactionId: payload.transactionId,
      productId: payload.productId,
      applied: result.applied,
      balanceAfter: result.applied ? result.balanceAfter : undefined,
    }).log('Processed Apple IAP pack transaction')

    return {
      kind: 'pack' as const,
      applied: result.applied,
      transactionId: payload.transactionId,
      ...(result.applied ? { balanceAfter: result.balanceAfter, fluxAmount: result.fluxAmount } : {}),
    }
  }
}
