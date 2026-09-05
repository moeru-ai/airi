import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library'

import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { EvidenceReceipt, PaymentService } from '../../services/domain/payment'
import type { Verifier } from './verifier'

import { Type } from '@apple/app-store-server-library'
import { useLogger } from '@guiiai/logg'
import { and, eq, isNull } from 'drizzle-orm'

import { createServiceUnavailableError } from '../../utils/error'

import * as schema from '../../schemas/payment'

const logger = useLogger('apple-iap')

export const APPLE_IAP_PROCESSOR = 'apple_iap' as const
export const APPLE_IAP_PROVIDER = APPLE_IAP_PROCESSOR

interface GrantableFields {
  transactionId: string
  productId: string
  appAccountToken: string
}

export function requireVerifier(verifier: Verifier | null): Verifier {
  if (!verifier)
    throw createServiceUnavailableError('Apple IAP is not configured', 'APPLE_IAP_DISABLED')
  return verifier
}

export async function findLiveAccount(
  db: Database,
  identity: { userId: string } | { token: string },
) {
  const identityClause = 'userId' in identity
    ? eq(schema.paymentCustomer.userId, identity.userId)
    : eq(schema.paymentCustomer.customerId, identity.token.toLowerCase())

  const [account] = await db
    .select({
      userId: schema.paymentCustomer.userId,
      customerId: schema.paymentCustomer.customerId,
    })
    .from(schema.paymentCustomer)
    .where(and(
      eq(schema.paymentCustomer.processor, APPLE_IAP_PROCESSOR),
      identityClause,
      isNull(schema.paymentCustomer.deletedAt),
    ))
    .limit(1)

  return account
}

export function grantableConsumableTransaction(payload: JWSTransactionDecodedPayload) {
  if (!payload.transactionId)
    return { ok: false as const, code: 'MISSING_TRANSACTION_ID', message: 'Transaction payload missing transactionId' }
  if (!payload.productId)
    return { ok: false as const, code: 'MISSING_PRODUCT_ID', message: 'Transaction payload missing productId' }
  if (!payload.originalTransactionId) {
    return {
      ok: false as const,
      code: 'MISSING_ORIGINAL_TRANSACTION_ID',
      message: 'Transaction payload missing originalTransactionId',
    }
  }
  // Apple omits appAccountToken when the app did not set it at purchase.
  if (!payload.appAccountToken) {
    return {
      ok: false as const,
      code: 'MISSING_APP_ACCOUNT_TOKEN',
      message: 'Transaction payload missing appAccountToken',
    }
  }
  if (payload.type !== Type.CONSUMABLE) {
    return {
      ok: false as const,
      code: 'PRODUCT_TYPE_NOT_SUPPORTED',
      message: 'Only consumable Apple products are supported',
    }
  }

  return {
    ok: true as const,
    fields: {
      transactionId: payload.transactionId,
      productId: payload.productId,
      appAccountToken: payload.appAccountToken,
    },
  }
}

export async function resolveAppleIapPack(configKV: ConfigKVService, productId: string) {
  const packs = await configKV.getOptional('FLUX_PACKS') ?? []
  return packs.find(item => item.processors?.appleIap?.productId === productId)
}

/**
 * Maps a verified StoreKit 2 transaction onto a CORE evidence receipt.
 * The channel supplies `userId` after it resolves `appAccountToken`,
 * and `packKey` / `fluxAmount` after it resolves `FLUX_PACKS`.
 */
function evidenceReceiptFromTransaction(
  payload: JWSTransactionDecodedPayload,
  fields: GrantableFields,
  userId: string,
  pack: { key: string, fluxAmount: number },
): EvidenceReceipt {
  return {
    kind: 'evidence',
    processor: APPLE_IAP_PROCESSOR,
    processorOrderId: fields.transactionId,
    userId,
    packKey: pack.key,
    fluxAmount: pack.fluxAmount,
    amount: payload.price ?? undefined,
    currency: payload.currency ?? undefined,
    customerId: fields.appAccountToken,
    extras: {
      transactionId: fields.transactionId,
      originalTransactionId: payload.originalTransactionId,
      productId: fields.productId,
      bundleId: payload.bundleId,
      environment: payload.environment,
      appAccountToken: fields.appAccountToken,
      purchaseDate: payload.purchaseDate,
      type: payload.type,
      webOrderLineItemId: payload.webOrderLineItemId,
    },
  }
}

export async function settleConsumable(
  payment: PaymentService,
  payload: JWSTransactionDecodedPayload,
  fields: GrantableFields,
  userId: string,
  pack: { key: string, fluxAmount: number },
) {
  const result = await payment.settle(evidenceReceiptFromTransaction(payload, fields, userId, pack))

  logger.withFields({
    userId,
    transactionId: fields.transactionId,
    productId: fields.productId,
    applied: result.applied,
    balanceAfter: result.applied ? result.balanceAfter : undefined,
  }).log('Processed Apple IAP pack transaction')

  return result
}
