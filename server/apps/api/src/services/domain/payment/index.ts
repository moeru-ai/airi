import type { Database } from '../../../libs/db'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { BillingService } from '../billing/billing-service'
import type { ClaimReceipt, FluxPack, SettleResult } from './types'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull } from 'drizzle-orm'

import { createInternalError } from '../../../utils/error'

import * as schema from '../../../schemas/payment'

export type { ClaimReceipt, FluxPack, SettleResult } from './types'

const logger = useLogger('payment')

/**
 * Loads the validated Flux pack catalog from ConfigKV.
 */
export async function loadFluxPacks(configKV: ConfigKVService): Promise<FluxPack[]> {
  const packs = await configKV.getOptional('FLUX_PACKS') ?? []
  return packs.map(pack => ({
    key: pack.key,
    name: pack.name,
    fluxAmount: pack.fluxAmount,
    recommended: pack.recommended ?? false,
    providers: pack.providers ?? {},
  }))
}

/**
 * Payment CORE: pack grant and `payment_order` ownership.
 *
 * Call stack:
 *
 * Stripe `POST /webhook` (after signature verify)
 * -> channel maps session to {@link ClaimReceipt}
 * -> {@link createPaymentService} `settle`
 * -> {@link BillingService.creditFlux}
 */
export function createPaymentService(db: Database, billing: BillingService) {
  async function upsertProviderAccount(
    tx: Pick<Database, 'insert' | 'update' | 'select'>,
    userId: string,
    provider: string,
    providerCustomerId: string,
  ) {
    const [existing] = await tx
      .select({ id: schema.providerAccount.id })
      .from(schema.providerAccount)
      .where(and(
        eq(schema.providerAccount.provider, provider),
        eq(schema.providerAccount.providerCustomerId, providerCustomerId),
        isNull(schema.providerAccount.deletedAt),
      ))
      .limit(1)

    const now = new Date()
    if (existing) {
      await tx.update(schema.providerAccount)
        .set({ userId, updatedAt: now })
        .where(eq(schema.providerAccount.id, existing.id))
      return
    }

    await tx.insert(schema.providerAccount).values({
      userId,
      provider,
      providerCustomerId,
    })
  }

  async function claimExistingOrder(receipt: ClaimReceipt): Promise<SettleResult> {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(schema.paymentOrder)
        .where(eq(schema.paymentOrder.id, receipt.paymentOrderId))
        .for('update')

      if (!order)
        throw createInternalError('Payment order not found')

      switch (receipt.status) {
        case 'paid': {
          if (order.status === 'paid')
            return { applied: false as const }

          if (order.status !== 'pending')
            return { applied: false as const }

          const fluxAmount = order.fluxAmount
          if (fluxAmount == null || fluxAmount <= 0)
            throw createInternalError('Payment order is missing flux_amount')

          const [claimed] = await tx.update(schema.paymentOrder)
            .set({
              status: 'paid',
              creditedAt: new Date(),
              providerOrderId: receipt.providerOrderId,
              amount: receipt.amount ?? order.amount,
              currency: receipt.currency ?? order.currency,
              providerData: receipt.extras ?? order.providerData,
              updatedAt: new Date(),
            })
            .where(and(
              eq(schema.paymentOrder.id, order.id),
              eq(schema.paymentOrder.status, 'pending'),
            ))
            .returning()

          if (!claimed)
            return { applied: false as const }

          const credit = await billing.creditFlux({
            userId: order.userId,
            amount: fluxAmount,
            requestId: order.id,
            description: `Flux pack ${claimed.packKey ?? 'unknown'}`,
            source: 'payment.pack',
            tx,
          })

          if (receipt.providerCustomerId) {
            await upsertProviderAccount(tx, order.userId, order.provider, receipt.providerCustomerId)
          }

          return {
            applied: true as const,
            userId: order.userId,
            fluxAmount,
            balanceAfter: credit.balanceAfter,
          }
        }
        case 'canceled':
        case 'expired': {
          if (order.status !== 'pending')
            return { applied: false as const }

          await tx.update(schema.paymentOrder)
            .set({
              status: receipt.status,
              providerOrderId: receipt.providerOrderId,
              providerData: receipt.extras ?? order.providerData,
              updatedAt: new Date(),
            })
            .where(and(
              eq(schema.paymentOrder.id, order.id),
              eq(schema.paymentOrder.status, 'pending'),
            ))

          return { applied: false as const }
        }
        default: {
          const exhaustive: never = receipt.status
          throw createInternalError(`Unhandled payment claim status: ${String(exhaustive)}`)
        }
      }
    })

    if (result.applied) {
      await billing.syncFluxCache(result.userId, result.balanceAfter, {
        amount: result.fluxAmount,
        source: 'payment.pack',
      })
    }

    return result
  }

  return {
    async settle(receipt: ClaimReceipt): Promise<SettleResult> {
      return claimExistingOrder(receipt)
    },

    /**
     * Soft-deletes `payment_order` and `provider_account` rows.
     * `flux_transaction` is not touched. Checkout sessions time out on Stripe.
     */
    async deleteAllForUser(userId: string) {
      const now = new Date()

      await db.update(schema.paymentOrder)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.paymentOrder.userId, userId),
          isNull(schema.paymentOrder.deletedAt),
        ))

      await db.update(schema.providerAccount)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.providerAccount.userId, userId),
          isNull(schema.providerAccount.deletedAt),
        ))

      logger.withFields({ userId }).log('Payment rows soft-deleted for user')
    },
  }
}

export type PaymentService = ReturnType<typeof createPaymentService>
