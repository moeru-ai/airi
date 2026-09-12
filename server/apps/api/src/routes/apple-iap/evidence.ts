import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library'

import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { EvidenceReceipt } from '../../services/domain/payment'

import { Type } from '@apple/app-store-server-library'
import { and, eq, isNull } from 'drizzle-orm'

import * as schema from '../../schemas/payment'

export const APPLE_IAP_PROCESSOR = 'apple_iap' as const

/** Fields consumed after StoreKit 2 JWS verification. */
export interface GrantableFields {
  transactionId: string
  productId: string
  appAccountToken: string
}

/**
 * Returns grantable fields, or a reason the payload cannot become evidence.
 * Apple omits `appAccountToken` when the app did not set it at purchase.
 */
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
  if (payload.revocationDate != null) {
    return {
      ok: false as const,
      code: 'TRANSACTION_REVOKED',
      message: 'Transaction was refunded or revoked',
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
  const applePacks = await configKV.getOptional('APPLE_FLUX_PACKS') ?? {}
  const packKey = applePacks[productId]
  if (!packKey)
    return undefined
  return packs.find(item => item.key === packKey)
}

/** Live `payment_customer` for this Apple `appAccountToken`. */
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

/** Maps a verified consumable onto an evidence receipt. Pack and user are resolved by the caller. */
export function evidenceReceiptFromTransaction(
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
