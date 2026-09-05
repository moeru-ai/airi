import type { Database } from '../../../libs/db'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { PaymentService } from '../../../services/domain/payment'
import type { Verifier } from '../verifier'

import { minLength, object, pipe, safeParse, string } from 'valibot'

import { createBadRequestError, createForbiddenError } from '../../../utils/error'
import {
  APPLE_IAP_PROCESSOR,
  findLiveAccount,
  grantableConsumableTransaction,
  requireVerifier,
  resolveAppleIapPack,
  settleConsumable,
} from '../evidence'

const SubmitTransactionBodySchema = object({
  signedTransaction: pipe(string(), minLength(1, 'signedTransaction is required')),
})

/**
 * Verifies a StoreKit 2 JWS from the device, then Payment CORE `settle`.
 * Mismatched `appAccountToken` is 403 so the client retries later.
 */
export function createTransactionsOperation(
  payment: PaymentService,
  db: Database,
  verifier: Verifier | null,
  configKV: ConfigKVService,
) {
  return async (userId: string, body: unknown) => {
    const apple = requireVerifier(verifier)

    const parsed = safeParse(SubmitTransactionBodySchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid transaction body', 'INVALID_REQUEST', parsed.issues)

    const payload = await apple.verifyTransaction(parsed.output.signedTransaction)
    const grantable = grantableConsumableTransaction(payload)
    if (!grantable.ok)
      throw createBadRequestError(grantable.message, grantable.code)

    const fields = grantable.fields
    const account = await findLiveAccount(db, { token: fields.appAccountToken })
    if (!account || account.userId !== userId)
      throw createForbiddenError('appAccountToken does not belong to the authenticated user')

    const pack = await resolveAppleIapPack(configKV, fields.productId)
    if (!pack) {
      throw createBadRequestError('Unknown product', 'UNKNOWN_PRODUCT', {
        processor: APPLE_IAP_PROCESSOR,
        productId: fields.productId,
      })
    }

    const result = await settleConsumable(payment, payload, fields, userId, pack)

    return {
      kind: 'pack' as const,
      applied: result.applied,
      transactionId: fields.transactionId,
      ...(result.applied ? { balanceAfter: result.balanceAfter } : {}),
    }
  }
}
