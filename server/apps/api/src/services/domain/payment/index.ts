import type { Database } from '../../../libs/db'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { BillingService } from '../billing/billing-service'
import type {
  ApplyConfirmationResult,
  ConfirmationFacts,
  FluxPack,
  FluxPackListItem,
  PaymentProvider,
  PaymentProviderName,
  ProviderProductRef,
  StartPackInput,
  StartPackResult,
} from './types'

import { useLogger } from '@guiiai/logg'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import { createBadRequestError, createInternalError, createServiceUnavailableError } from '../../../utils/error'

import * as schema from '../../../schemas/payment'

export { createStripePaymentProvider } from './adapters/stripe'
export type { ApplyConfirmationResult, ConfirmationFacts, FluxPack, FluxPackListItem, PackStartContext, PaymentProvider, StartPackInput, StartPackResult } from './types'

const logger = useLogger('payment')

const OPEN_CHECKOUT_CANCEL_STATUSES = ['pending'] as const

export interface PaymentServiceDeps {
  db: Database
  billing: BillingService
  configKV: ConfigKVService
  providers: Partial<Record<PaymentProviderName, PaymentProvider>>
}

/**
 * Payment CORE: one-time pack checkout, claim, and account deletion.
 *
 * Call stack:
 *
 * Stripe `POST /checkout`
 * -> {@link createPaymentService} `startPack`
 * -> Provider `create`
 *
 * Stripe `POST /webhook` (after signature verify)
 * -> Provider `confirmed`
 * -> {@link createPaymentService} `applyConfirmation`
 * -> {@link BillingService.creditFlux}
 */
export function createPaymentService(deps: PaymentServiceDeps) {
  function requireProvider(provider: PaymentProviderName): PaymentProvider {
    const adapter = deps.providers[provider]
    if (!adapter)
      throw createServiceUnavailableError('Payment provider is not configured', 'PAYMENT_PROVIDER_UNAVAILABLE', { provider })
    return adapter
  }

  async function loadFluxPacks(): Promise<FluxPack[]> {
    const packs = await deps.configKV.getOptional('FLUX_PACKS') ?? []
    return packs.map(pack => ({
      key: pack.key,
      name: pack.name,
      fluxAmount: pack.fluxAmount,
      recommended: pack.recommended ?? false,
      providers: pack.providers ?? {},
    }))
  }

  async function getFluxPackByKey(packKey: string): Promise<FluxPack> {
    const pack = (await loadFluxPacks()).find(item => item.key === packKey)
    if (!pack)
      throw createBadRequestError('Invalid pack', 'INVALID_PACKAGE', { packKey })
    return pack
  }

  async function resolvePack(ref: ProviderProductRef): Promise<FluxPack | null> {
    const packs = await loadFluxPacks()
    if (ref.provider === 'stripe')
      return packs.find(item => item.providers.stripe?.priceId === ref.providerProductId) ?? null
    return null
  }

  async function upsertProviderAccount(
    tx: Pick<Database, 'insert' | 'update' | 'select'>,
    input: { userId: string, provider: string, providerCustomerId: string },
  ) {
    const [existing] = await tx
      .select({ id: schema.providerAccount.id })
      .from(schema.providerAccount)
      .where(and(
        eq(schema.providerAccount.provider, input.provider),
        eq(schema.providerAccount.providerCustomerId, input.providerCustomerId),
        isNull(schema.providerAccount.deletedAt),
      ))
      .limit(1)

    const now = new Date()
    if (existing) {
      await tx.update(schema.providerAccount)
        .set({ userId: input.userId, updatedAt: now })
        .where(eq(schema.providerAccount.id, existing.id))
      return
    }

    await tx.insert(schema.providerAccount).values({
      userId: input.userId,
      provider: input.provider,
      providerCustomerId: input.providerCustomerId,
    })
  }

  return {
    async listPacks(provider: PaymentProviderName): Promise<FluxPackListItem[]> {
      const adapter = requireProvider(provider)
      return adapter.listPackages(await loadFluxPacks())
    },

    resolvePack,

    async getProviderAccount(input: { userId: string, provider: PaymentProviderName }) {
      const row = await deps.db.query.providerAccount.findFirst({
        where: and(
          eq(schema.providerAccount.userId, input.userId),
          eq(schema.providerAccount.provider, input.provider),
          isNull(schema.providerAccount.deletedAt),
        ),
      })
      if (!row)
        return null
      return { providerCustomerId: row.providerCustomerId }
    },

    async startPack(input: StartPackInput): Promise<StartPackResult> {
      const adapter = requireProvider(input.provider)
      const pack = await getFluxPackByKey(input.packKey)

      const [order] = await deps.db.insert(schema.paymentOrder).values({
        userId: input.userId,
        provider: input.provider,
        status: 'pending',
        packKey: pack.key,
        fluxAmount: pack.fluxAmount,
        currency: input.startContext.currency,
      }).returning()

      if (!order)
        throw createInternalError('Failed to create payment order')

      const account = await deps.db.query.providerAccount.findFirst({
        where: and(
          eq(schema.providerAccount.userId, input.userId),
          eq(schema.providerAccount.provider, input.provider),
          isNull(schema.providerAccount.deletedAt),
        ),
      })

      const created = await adapter.create({
        paymentOrderId: order.id,
        userId: input.userId,
        pack,
        currency: input.startContext.currency,
        successUrl: input.startContext.successUrl,
        cancelUrl: input.startContext.cancelUrl,
        customerEmail: input.startContext.customerEmail,
        providerCustomerId: account?.providerCustomerId ?? null,
        metadata: input.startContext.metadata,
      })

      await deps.db.update(schema.paymentOrder)
        .set({
          providerOrderId: created.providerOrderId,
          amount: created.amount,
          currency: created.currency ?? input.startContext.currency,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.paymentOrder.id, order.id),
          isNull(schema.paymentOrder.providerOrderId),
        ))

      return { kind: 'redirect', url: created.url, paymentOrderId: order.id }
    },

    async applyConfirmation(facts: ConfirmationFacts): Promise<ApplyConfirmationResult> {
      if (!facts.paymentOrderId)
        throw createInternalError('Payment confirmation is missing payment_order_id')

      const paymentOrderId = facts.paymentOrderId
      const result = await deps.db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(schema.paymentOrder)
          .where(eq(schema.paymentOrder.id, paymentOrderId))
          .for('update')

        if (!order)
          throw createInternalError('Payment order not found')

        switch (facts.status) {
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
                providerOrderId: facts.providerOrderId,
                amount: facts.amount ?? order.amount,
                currency: facts.currency ?? order.currency,
                providerData: facts.providerData ?? order.providerData,
                updatedAt: new Date(),
              })
              .where(and(
                eq(schema.paymentOrder.id, order.id),
                eq(schema.paymentOrder.status, 'pending'),
              ))
              .returning()

            if (!claimed)
              return { applied: false as const }

            const credit = await deps.billing.creditFlux({
              userId: order.userId,
              amount: fluxAmount,
              requestId: order.id,
              description: `Flux pack ${claimed.packKey ?? 'unknown'}`,
              source: 'payment.pack',
              tx,
            })

            if (facts.providerCustomerId) {
              await upsertProviderAccount(tx, {
                userId: order.userId,
                provider: order.provider,
                providerCustomerId: facts.providerCustomerId,
              })
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
                status: facts.status,
                providerOrderId: facts.providerOrderId,
                providerData: facts.providerData ?? order.providerData,
                updatedAt: new Date(),
              })
              .where(and(
                eq(schema.paymentOrder.id, order.id),
                eq(schema.paymentOrder.status, 'pending'),
              ))

            return { applied: false as const }
          }
          default: {
            const exhaustive: never = facts.status
            throw createInternalError(`Unhandled payment confirmation status: ${String(exhaustive)}`)
          }
        }
      })

      if (result.applied) {
        await deps.billing.syncFluxCache(result.userId, result.balanceAfter, {
          amount: result.fluxAmount,
          source: 'payment.pack',
        })
      }

      return result
    },

    async cancel(input: { paymentOrderId: string }) {
      const [order] = await deps.db
        .select()
        .from(schema.paymentOrder)
        .where(and(
          eq(schema.paymentOrder.id, input.paymentOrderId),
          isNull(schema.paymentOrder.deletedAt),
        ))
        .limit(1)

      if (!order)
        throw createBadRequestError('Payment order not found', 'PAYMENT_ORDER_NOT_FOUND')

      if (order.status !== 'pending')
        return

      if (order.providerOrderId) {
        const adapter = requireProvider(order.provider as PaymentProviderName)
        await adapter.cancel({ providerOrderId: order.providerOrderId })
      }

      await deps.db.update(schema.paymentOrder)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(and(
          eq(schema.paymentOrder.id, order.id),
          eq(schema.paymentOrder.status, 'pending'),
        ))
    },

    /**
     * Cancels open provider objects, then soft-deletes orders and accounts.
     * `flux_transaction` is not touched.
     */
    async deleteAllForUser(userId: string) {
      const pending = await deps.db
        .select({
          id: schema.paymentOrder.id,
          provider: schema.paymentOrder.provider,
          providerOrderId: schema.paymentOrder.providerOrderId,
        })
        .from(schema.paymentOrder)
        .where(and(
          eq(schema.paymentOrder.userId, userId),
          inArray(schema.paymentOrder.status, [...OPEN_CHECKOUT_CANCEL_STATUSES]),
          isNull(schema.paymentOrder.deletedAt),
        ))

      for (const order of pending) {
        if (!order.providerOrderId)
          continue
        const adapter = deps.providers[order.provider as PaymentProviderName]
        if (!adapter)
          continue
        await adapter.cancel({ providerOrderId: order.providerOrderId })
      }

      const now = new Date()

      await deps.db.update(schema.paymentOrder)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.paymentOrder.userId, userId),
          isNull(schema.paymentOrder.deletedAt),
        ))

      await deps.db.update(schema.providerAccount)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.providerAccount.userId, userId),
          isNull(schema.providerAccount.deletedAt),
        ))

      logger.withFields({ userId, cancelledOrders: pending.length }).log('Payment rows soft-deleted for user')
    },
  }
}

export type PaymentService = ReturnType<typeof createPaymentService>
