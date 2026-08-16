import type { PaymentService } from '../../../services/domain/payment'
import type { AppleIapVerifier } from '../../../services/domain/payment/adapters/apple-verifier'

import { Type } from '@apple/app-store-server-library'
import { useLogger } from '@guiiai/logg'
import { v5 as uuidv5 } from 'uuid'
import { safeParse } from 'valibot'

import { APPLE_IAP_NAMESPACE_UUID } from '../../../utils/apple-iap'
import {
  ApiError,
  createBadRequestError,
  createForbiddenError,
  createServiceUnavailableError,
} from '../../../utils/error'
import { evidenceReceiptFromAppleTransaction } from '../claim'
import { SubmitTransactionBodySchema } from '../schema'

const logger = useLogger('apple-iap.transactions')

export interface TransactionOperationDeps {
  payment: PaymentService
  verifier: AppleIapVerifier | null
}

/**
 * Verifies a client-posted StoreKit 2 JWS and settles evidence with CORE.
 *
 * Server contract for the native client:
 * - 2xx or 4xx: the client can finish the StoreKit transaction (ack).
 * - 5xx: the client must keep the transaction unfinished and retry later.
 *
 * Auto-renewable subscriptions are rejected until the subscription PR lands.
 */
export function createTransactionOperation(deps: TransactionOperationDeps) {
  return async (input: { userId: string, body: unknown }) => {
    if (!deps.verifier)
      throw createServiceUnavailableError('Apple IAP is not configured', 'APPLE_IAP_DISABLED')

    const parsed = safeParse(SubmitTransactionBodySchema, input.body)
    if (!parsed.success)
      throw createBadRequestError('Invalid transaction body', 'INVALID_REQUEST', parsed.issues)

    const payload = await deps.verifier.verifyTransaction(parsed.output.signedTransaction)

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

    const expectedToken = uuidv5(input.userId, APPLE_IAP_NAMESPACE_UUID)
    if (!payload.appAccountToken || payload.appAccountToken.toLowerCase() !== expectedToken.toLowerCase()) {
      logger.withFields({
        userId: input.userId,
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

    const receipt = evidenceReceiptFromAppleTransaction({
      transaction: payload,
      userId: input.userId,
    })
    const result = await deps.payment.settle(receipt)

    logger.withFields({
      userId: input.userId,
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
