import type { Database } from '../../../libs/db'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { PaymentService } from '../../../services/domain/payment'
import type { Verifier } from '../verifier'

import { NotificationTypeV2 } from '@apple/app-store-server-library'
import { useLogger } from '@guiiai/logg'
import { minLength, object, pipe, safeParse, string } from 'valibot'

import { createBadRequestError } from '../../../utils/error'
import {
  findLiveAccount,
  grantableConsumableTransaction,
  requireVerifier,
  resolveAppleIapPack,
  settleConsumable,
} from '../evidence'

const logger = useLogger('apple-iap')

const NotificationBodySchema = object({
  signedPayload: pipe(string(), minLength(1, 'signedPayload is required')),
})

/**
 * Verifies an App Store Server Notifications V2 payload.
 * Only `ONE_TIME_CHARGE` grants. Other types and unknown tokens ack 200 and stop.
 */
export function createNotificationsOperation(
  payment: PaymentService,
  db: Database,
  verifier: Verifier | null,
  configKV: ConfigKVService,
) {
  return async (body: unknown): Promise<{ received: true }> => {
    const apple = requireVerifier(verifier)

    const parsed = safeParse(NotificationBodySchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid notification body', 'INVALID_REQUEST', parsed.issues)

    const notification = await apple.verifyNotification(parsed.output.signedPayload)
    if (notification.notificationType !== NotificationTypeV2.ONE_TIME_CHARGE) {
      logger.withFields({ notificationType: notification.notificationType }).log('Ignoring Apple IAP notification')
      return { received: true }
    }

    const signedTransaction = notification.data?.signedTransactionInfo
    if (!signedTransaction) {
      logger.warn('ONE_TIME_CHARGE notification missing signedTransactionInfo')
      return { received: true }
    }

    const payload = await apple.verifyTransaction(signedTransaction)
    const grantable = grantableConsumableTransaction(payload)
    if (!grantable.ok) {
      logger.withFields({
        transactionId: payload.transactionId,
        code: grantable.code,
      }).warn('ONE_TIME_CHARGE transaction ignored')
      return { received: true }
    }

    const fields = grantable.fields

    // Unknown token: 200 and no grant. A 5xx would make Apple retry forever.
    const account = await findLiveAccount(db, { token: fields.appAccountToken })
    if (!account) {
      logger.withFields({ transactionId: fields.transactionId }).warn('ONE_TIME_CHARGE token is unknown')
      return { received: true }
    }

    const pack = await resolveAppleIapPack(configKV, fields.productId)
    if (!pack) {
      logger.withFields({
        transactionId: fields.transactionId,
        productId: fields.productId,
      }).warn('ONE_TIME_CHARGE product is unknown')
      return { received: true }
    }

    await settleConsumable(payment, payload, fields, account.userId, pack)
    return { received: true }
  }
}
