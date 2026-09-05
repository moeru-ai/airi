import type { Database } from '../../../libs/db'
import type { BillingService } from '../billing/billing-service'
import type {
  BindProcessorOrderInput,
  ClaimReceipt,
  EvidenceReceipt,
  OpenPendingInput,
  PendingPaymentOrder,
  Receipt,
  SettleResult,
} from './types'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull } from 'drizzle-orm'

import { createInternalError } from '../../../utils/error'

import * as schema from '../../../schemas/payment'

export type {
  BindProcessorOrderInput,
  ClaimReceipt,
  EvidenceReceipt,
  OpenPendingInput,
  PendingPaymentOrder,
  Receipt,
  SettleResult,
} from './types'

const logger = useLogger('payment')

/**
 * Payment CORE: pack grant and `payment_order` ownership.
 *
 * Call stack:
 *
 * Stripe `POST /checkout`
 * -> {@link createPaymentService} `openPending`
 * -> Stripe adapter creates the Checkout Session
 * -> {@link createPaymentService} `bindProcessorOrder`
 *
 * Stripe `POST /webhook` (after signature verify)
 * -> Stripe adapter maps session to {@link ClaimReceipt}
 * -> {@link createPaymentService} `settle`
 * -> {@link BillingService.creditFlux}
 *
 * Apple `POST /transactions` (after JWS verify)
 * -> channel maps transaction to {@link EvidenceReceipt}
 * -> {@link createPaymentService} `settle`
 * -> {@link BillingService.creditFlux}
 */
export function createPaymentService(db: Database, billing: BillingService) {
  async function insertPaymentCustomerIfAbsent(
    tx: Pick<Database, 'insert' | 'select'>,
    userId: string,
    processor: string,
    customerId: string,
  ) {
    const [existing] = await tx
      .select({ id: schema.paymentCustomer.id })
      .from(schema.paymentCustomer)
      .where(and(
        eq(schema.paymentCustomer.processor, processor),
        eq(schema.paymentCustomer.customerId, customerId),
        isNull(schema.paymentCustomer.deletedAt),
      ))
      .limit(1)

    if (existing)
      return

    // Unique races must not abort the settle transaction.
    await tx.insert(schema.paymentCustomer).values({
      userId,
      processor,
      customerId,
    }).onConflictDoNothing()
  }

  async function findLivePaymentCustomer(userId: string, processor: string) {
    const [customer] = await db
      .select({ customerId: schema.paymentCustomer.customerId })
      .from(schema.paymentCustomer)
      .where(and(
        eq(schema.paymentCustomer.userId, userId),
        eq(schema.paymentCustomer.processor, processor),
        isNull(schema.paymentCustomer.deletedAt),
      ))
      .limit(1)

    return customer?.customerId
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
              processorOrderId: receipt.processorOrderId,
              amount: receipt.amount ?? order.amount,
              currency: receipt.currency ?? order.currency,
              processorData: receipt.extras ?? order.processorData,
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

          if (receipt.customerId) {
            await insertPaymentCustomerIfAbsent(tx, order.userId, order.processor, receipt.customerId)
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
              processorOrderId: receipt.processorOrderId,
              processorData: receipt.extras ?? order.processorData,
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

  async function claimEvidenceOrder(receipt: EvidenceReceipt): Promise<SettleResult> {
    const [existing] = await db
      .select({ id: schema.paymentOrder.id })
      .from(schema.paymentOrder)
      .where(and(
        eq(schema.paymentOrder.processor, receipt.processor),
        eq(schema.paymentOrder.processorOrderId, receipt.processorOrderId),
      ))
      .limit(1)

    if (existing)
      return { applied: false }

    const result = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(schema.paymentOrder).values({
        userId: receipt.userId,
        processor: receipt.processor,
        processorOrderId: receipt.processorOrderId,
        status: 'paid',
        packKey: receipt.packKey,
        fluxAmount: receipt.fluxAmount,
        amount: receipt.amount,
        currency: receipt.currency,
        creditedAt: new Date(),
        processorData: receipt.extras,
      }).onConflictDoNothing().returning()

      if (!inserted)
        return { applied: false as const }

      const credit = await billing.creditFlux({
        userId: receipt.userId,
        amount: receipt.fluxAmount,
        requestId: inserted.id,
        description: `Flux pack ${receipt.packKey}`,
        source: 'payment.pack',
        tx,
      })

      if (receipt.customerId) {
        await insertPaymentCustomerIfAbsent(tx, receipt.userId, receipt.processor, receipt.customerId)
      }

      return {
        applied: true as const,
        userId: receipt.userId,
        fluxAmount: receipt.fluxAmount,
        balanceAfter: credit.balanceAfter,
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
    async openPending(input: OpenPendingInput): Promise<PendingPaymentOrder> {
      const [row] = await db.insert(schema.paymentOrder).values({
        userId: input.userId,
        processor: input.processor,
        status: 'pending',
        packKey: input.packKey,
        fluxAmount: input.fluxAmount,
        currency: input.currency,
      }).returning()

      if (!row)
        throw createInternalError('Failed to create payment order')

      const customerId = await findLivePaymentCustomer(input.userId, input.processor)
      return { id: row.id, customerId }
    },

    /**
     * Stores the processor checkout id when the row still has none.
     * A concurrent settle that already wrote the id wins.
     */
    async bindProcessorOrder(orderId: string, input: BindProcessorOrderInput): Promise<void> {
      await db.update(schema.paymentOrder)
        .set({
          processorOrderId: input.processorOrderId,
          amount: input.amount,
          currency: input.currency,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.paymentOrder.id, orderId),
          isNull(schema.paymentOrder.processorOrderId),
          isNull(schema.paymentOrder.deletedAt),
        ))
    },

    /**
     * Marks a pending order canceled. Does not credit Flux.
     * No-op when the order is no longer pending.
     */
    async abandon(orderId: string): Promise<void> {
      await db.update(schema.paymentOrder)
        .set({
          status: 'canceled',
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.paymentOrder.id, orderId),
          eq(schema.paymentOrder.status, 'pending'),
          isNull(schema.paymentOrder.deletedAt),
        ))
    },

    async settle(receipt: Receipt): Promise<SettleResult> {
      switch (receipt.kind) {
        case 'claim':
          return claimExistingOrder(receipt)
        case 'evidence':
          return claimEvidenceOrder(receipt)
        default: {
          const exhaustive: never = receipt
          throw createInternalError(`Unhandled payment receipt: ${String(exhaustive)}`)
        }
      }
    },

    /**
     * Soft-deletes `payment_order` and `payment_customer` rows.
     * `flux_transaction` is not touched. Checkout sessions time out at the processor.
     */
    async deleteAllForUser(userId: string) {
      const now = new Date()

      await db.update(schema.paymentOrder)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.paymentOrder.userId, userId),
          isNull(schema.paymentOrder.deletedAt),
        ))

      await db.update(schema.paymentCustomer)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.paymentCustomer.userId, userId),
          isNull(schema.paymentCustomer.deletedAt),
        ))

      logger.withFields({ userId }).log('Payment rows soft-deleted for user')
    },
  }
}

export type PaymentService = ReturnType<typeof createPaymentService>
