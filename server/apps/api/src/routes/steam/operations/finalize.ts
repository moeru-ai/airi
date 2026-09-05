import type { Database } from '../../../libs/db'
import type { ClaimReceipt, PaymentService } from '../../../services/domain/payment'
import type { SteamMicroTxnClient } from '../client'

import { and, eq } from 'drizzle-orm'
import { minLength, object, pipe, safeParse, string } from 'valibot'

import { ApiError, createBadRequestError, createNotFoundError, createServiceUnavailableError } from '../../../utils/error'
import { STEAM_TXN_DENIED } from '../client'
import { findLinkedSteamId } from '../linked-steam-id'

import * as schema from '../../../schemas/payment'

const FinalizeBodySchema = object({
  orderId: pipe(string(), minLength(1)),
})

/**
 * Calls Steam FinalizeTxn for the caller's pending order, then CORE `settle`.
 */
export function createFinalizeOperation(
  payment: PaymentService,
  db: Database,
  client: SteamMicroTxnClient | null,
) {
  return async (
    user: { id: string },
    body: unknown,
  ) => {
    if (!client)
      throw createServiceUnavailableError('Steam MicroTxn is not configured', 'STEAM_MICROTXN_DISABLED')

    const parsed = safeParse(FinalizeBodySchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid finalize request', 'INVALID_REQUEST', parsed.issues)

    const { orderId } = parsed.output
    const [order] = await db
      .select()
      .from(schema.paymentOrder)
      .where(and(
        eq(schema.paymentOrder.processor, 'steam'),
        eq(schema.paymentOrder.processorOrderId, orderId),
        eq(schema.paymentOrder.userId, user.id),
      ))
      .limit(1)

    if (!order)
      throw createNotFoundError('Payment order not found')

    if (order.status === 'paid')
      return { status: 'paid' as const }

    if (order.status !== 'pending')
      throw createBadRequestError('Payment order is not pending', 'ORDER_NOT_PENDING', { status: order.status })

    const steamId = await findLinkedSteamId(db, user.id)
    const { id: paymentOrderId, amount, currency } = order

    try {
      const { transId } = await client.finalizeTxn({ orderId })
      await payment.settle(steamClaimReceipt({
        paymentOrderId,
        orderId,
        status: 'paid',
        amount,
        currency,
        steamId,
        transId,
      }))
      return { status: 'paid' as const }
    }
    catch (error) {
      if (error instanceof ApiError && error.errorCode === STEAM_TXN_DENIED) {
        await payment.settle(steamClaimReceipt({
          paymentOrderId,
          orderId,
          status: 'canceled',
          amount,
          currency,
          steamId,
        }))
        return { status: 'canceled' as const }
      }
      throw error
    }
  }
}

function steamClaimReceipt({
  paymentOrderId,
  orderId,
  status,
  amount,
  currency,
  steamId,
  transId,
}: {
  paymentOrderId: string
  orderId: string
  status: ClaimReceipt['status']
  amount?: number | null
  currency?: string | null
  steamId?: string
  transId?: string
}): ClaimReceipt {
  return {
    kind: 'claim',
    processor: 'steam',
    paymentOrderId,
    processorOrderId: orderId,
    status,
    amount: amount ?? undefined,
    currency: currency ?? undefined,
    customerId: steamId,
    extras: {
      orderId,
      transId,
      steamId,
    },
  }
}
