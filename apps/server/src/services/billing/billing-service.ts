import type Redis from 'ioredis'

import type { Database } from '../../libs/db'
import type { MqService } from '../../libs/mq'
import type { RevenueMetrics } from '../../libs/otel'
import type { ConfigKVService } from '../config-kv'
import type { BillingEvent } from './billing-events'

import { useLogger } from '@guiiai/logg'
import { and, eq } from 'drizzle-orm'

import { createPaymentRequiredError } from '../../utils/error'
import { nanoid } from '../../utils/id'
import { userFluxRedisKey } from '../../utils/redis-keys'

import * as fluxSchema from '../../schemas/flux'
import * as fluxTxSchema from '../../schemas/flux-transaction'
import * as stripeSchema from '../../schemas/stripe'

const logger = useLogger('billing-service')

export function createBillingService(
  db: Database,
  redis: Redis,
  billingMq: MqService<BillingEvent>,
  _configKV: ConfigKVService,
  metrics?: RevenueMetrics | null,
) {
  /**
   * Update Redis cache after a successful DB transaction.
   * Best-effort: cache loss is harmless since DB is the source of truth.
   */
  async function updateRedisCache(userId: string, balance: number): Promise<void> {
    try {
      await redis.set(userFluxRedisKey(userId), String(balance))
    }
    catch {
      logger.withFields({ userId }).warn('Failed to update Redis cache after balance change')
    }
  }

  /**
   * Publish a billing event to the Redis Stream.
   * Best-effort: failures are logged but not re-thrown so callers are not blocked.
   */
  async function publishEvent(event: BillingEvent): Promise<void> {
    try {
      await billingMq.publish(event)
    }
    catch (error) {
      logger.withError(error).withFields({
        eventId: event.eventId,
        eventType: event.eventType,
        userId: event.userId,
      }).error('Failed to publish billing event to stream')
    }
  }

  /**
   * Debit flux from a user's balance within a DB transaction.
   * The transaction ONLY locks the row and updates the balance.
   * Transaction entries are written by the billing-mq consumer
   * after it processes the flux.debited event published post-commit.
   *
   * Private — call domain-specific wrappers (e.g. consumeFluxForLLM) instead.
   */
  async function debitFlux(input: {
    userId: string
    amount: number
    requestId?: string
    description?: string
    source: string
    metadata?: Record<string, unknown>
  }): Promise<{ userId: string, flux: number }> {
    const result = await db.transaction(async (tx) => {
      // 1. Lock the row and read current balance
      const [row] = await tx
        .select({ flux: fluxSchema.userFlux.flux })
        .from(fluxSchema.userFlux)
        .where(eq(fluxSchema.userFlux.userId, input.userId))
        .for('update')

      if (!row) {
        throw new Error(`No flux record for user ${input.userId}`)
      }

      const balanceBefore = row.flux
      if (balanceBefore < input.amount) {
        metrics?.fluxInsufficientBalance.add(1)
        throw createPaymentRequiredError('Insufficient flux')
      }

      const balanceAfter = balanceBefore - input.amount

      // 2. Update balance
      await tx.update(fluxSchema.userFlux)
        .set({ flux: balanceAfter, updatedAt: new Date() })
        .where(eq(fluxSchema.userFlux.userId, input.userId))

      return { userId: input.userId, flux: balanceAfter, balanceBefore }
    })

    // 3. Update Redis cache after commit (best-effort)
    await updateRedisCache(input.userId, result.flux)

    // 4. Publish flux.debited event to stream; transaction + audit written by consumer
    await publishEvent({
      eventId: nanoid(),
      eventType: 'flux.debited',
      aggregateId: input.userId,
      userId: input.userId,
      requestId: input.requestId,
      occurredAt: new Date().toISOString(),
      schemaVersion: 1,
      payload: {
        amount: input.amount,
        balanceAfter: result.flux,
        source: input.source,
        description: input.description,
        metadata: input.metadata,
      },
    })

    logger.withFields({ userId: input.userId, amount: input.amount, balance: result.flux }).log('Debited flux')
    return { userId: result.userId, flux: result.flux }
  }

  return {
    /**
     * Debit flux for an LLM API request (chat, TTS, ASR).
     * Passes token usage as opaque metadata carried through the flux.debited event
     * so the billing-mq consumer can write it to the transaction log.
     */
    async consumeFluxForLLM(input: {
      userId: string
      amount: number
      requestId?: string
      description?: string
      model?: string
      promptTokens?: number
      completionTokens?: number
    }): Promise<{ userId: string, flux: number }> {
      return debitFlux({
        userId: input.userId,
        amount: input.amount,
        requestId: input.requestId,
        description: input.description,
        source: 'llm.request',
        metadata: {
          ...(input.model != null && { model: input.model }),
          ...(input.promptTokens != null && { promptTokens: input.promptTokens }),
          ...(input.completionTokens != null && { completionTokens: input.completionTokens }),
        },
      })
    },

    /**
     * Credit flux to a user's balance within a DB transaction.
     * Generic credit method for non-Stripe flows (e.g. admin grants).
     * Transaction entries are written inside the transaction for immediate visibility.
     */
    async creditFlux(input: {
      userId: string
      amount: number
      requestId?: string
      description: string
      source: string
      auditMetadata?: Record<string, unknown>
    }): Promise<{ balanceBefore: number, balanceAfter: number }> {
      const result = await db.transaction(async (tx) => {
        // Ensure user record exists
        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        // Lock and read current balance
        const [row] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = row!.flux
        const balanceAfter = balanceBefore + input.amount

        // Update balance
        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        // Transaction entry
        await tx.insert(fluxTxSchema.fluxTransaction).values({
          userId: input.userId,
          type: 'credit',
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          requestId: input.requestId,
          description: input.description,
          metadata: input.auditMetadata,
        })

        return { balanceBefore, balanceAfter }
      })

      await updateRedisCache(input.userId, result.balanceAfter)

      // Publish flux.credited event after commit
      await publishEvent({
        eventId: nanoid(),
        eventType: 'flux.credited',
        aggregateId: input.userId,
        userId: input.userId,
        requestId: input.requestId,
        occurredAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: {
          amount: input.amount,
          balanceAfter: result.balanceAfter,
          source: input.source,
        },
      })

      logger.withFields({ userId: input.userId, amount: input.amount, balance: result.balanceAfter }).log('Credited flux')
      return result
    },

    /**
     * Credit flux from a Stripe checkout session (one-time payment).
     * Idempotent: checks fluxCredited flag before applying.
     * Transaction entries are written inside the transaction for immediate visibility.
     */
    async creditFluxFromStripeCheckout(input: {
      stripeEventId: string
      userId: string
      stripeSessionId: string
      amountTotal: number
      currency: string | null
      fluxAmount: number
    }): Promise<{ applied: boolean, balanceAfter?: number }> {
      const txResult = await db.transaction(async (tx) => {
        // NOTICE: Webhook idempotency is enforced at the business-object level, not by a
        // dedicated processed-events table keyed on Stripe `event.id`. We claim the
        // checkout session row exactly once via `fluxCredited = false -> true`, which
        // covers both Stripe retries of the same event and distinct Event objects that
        // still refer to the same checkout session.
        // Atomic claim: set fluxCredited = true only if currently false
        const [claimed] = await tx.update(stripeSchema.stripeCheckoutSession)
          .set({ fluxCredited: true, updatedAt: new Date() })
          .where(and(
            eq(stripeSchema.stripeCheckoutSession.stripeSessionId, input.stripeSessionId),
            eq(stripeSchema.stripeCheckoutSession.fluxCredited, false),
          ))
          .returning()

        if (!claimed) {
          return { applied: false }
        }

        // Ensure user record exists
        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        // Lock and read balance
        const [currentFlux] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = currentFlux!.flux
        const balanceAfter = balanceBefore + input.fluxAmount

        // Update balance
        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        const description = `Stripe payment ${input.currency?.toUpperCase() ?? 'UNKNOWN'} ${(input.amountTotal / 100).toFixed(2)}`

        // Transaction entry
        await tx.insert(fluxTxSchema.fluxTransaction).values({
          userId: input.userId,
          type: 'credit',
          amount: input.fluxAmount,
          balanceBefore,
          balanceAfter,
          requestId: input.stripeEventId,
          description,
          metadata: {
            stripeEventId: input.stripeEventId,
            stripeSessionId: input.stripeSessionId,
            source: 'stripe.checkout.completed',
          },
        })

        return { applied: true, balanceAfter }
      })

      if (txResult.applied && txResult.balanceAfter != null) {
        await updateRedisCache(input.userId, txResult.balanceAfter)

        // Publish both events after commit
        const occurredAt = new Date().toISOString()
        await publishEvent({
          eventId: nanoid(),
          eventType: 'flux.credited',
          aggregateId: input.userId,
          userId: input.userId,
          requestId: input.stripeEventId,
          occurredAt,
          schemaVersion: 1,
          payload: {
            amount: input.fluxAmount,
            balanceAfter: txResult.balanceAfter,
            source: 'stripe.checkout.completed',
          },
        })

        await publishEvent({
          eventId: nanoid(),
          eventType: 'stripe.checkout.completed',
          aggregateId: input.stripeSessionId,
          userId: input.userId,
          requestId: input.stripeEventId,
          occurredAt,
          schemaVersion: 1,
          payload: {
            stripeEventId: input.stripeEventId,
            stripeSessionId: input.stripeSessionId,
            amount: input.amountTotal,
            currency: input.currency ?? 'unknown',
          },
        })
      }

      return txResult
    },

    /**
     * Credit flux from a Stripe invoice payment (subscription).
     * Idempotent: checks fluxCredited flag on the invoice record.
     * Transaction entries are written inside the transaction for immediate visibility.
     */
    async creditFluxFromInvoice(input: {
      stripeEventId: string
      userId: string
      stripeInvoiceId: string
      amountPaid: number
      currency: string
      fluxAmount: number
    }): Promise<{ applied: boolean, balanceAfter?: number }> {
      const txResult = await db.transaction(async (tx) => {
        // NOTICE: Invoice webhook idempotency follows the same object-level claim model
        // as checkout sessions. We intentionally dedupe on the invoice record instead of
        // only on Stripe `event.id`, because Stripe may emit multiple events that map to
        // the same paid invoice while the balance must only be credited once.
        // Atomic claim: set fluxCredited = true only if currently false
        const [claimed] = await tx.update(stripeSchema.stripeInvoice)
          .set({ fluxCredited: true, updatedAt: new Date() })
          .where(and(
            eq(stripeSchema.stripeInvoice.stripeInvoiceId, input.stripeInvoiceId),
            eq(stripeSchema.stripeInvoice.fluxCredited, false),
          ))
          .returning()

        if (!claimed) {
          return { applied: false }
        }

        // Ensure user record exists
        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        // Lock and read balance
        const [currentFlux] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = currentFlux!.flux
        const balanceAfter = balanceBefore + input.fluxAmount

        // Update balance
        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        const description = `Subscription invoice ${input.currency.toUpperCase()} ${(input.amountPaid / 100).toFixed(2)}`

        // Transaction entry
        await tx.insert(fluxTxSchema.fluxTransaction).values({
          userId: input.userId,
          type: 'credit',
          amount: input.fluxAmount,
          balanceBefore,
          balanceAfter,
          requestId: input.stripeEventId,
          description,
          metadata: {
            stripeEventId: input.stripeEventId,
            stripeInvoiceId: input.stripeInvoiceId,
            source: 'invoice.paid',
          },
        })

        return { applied: true, balanceAfter }
      })

      if (txResult.applied && txResult.balanceAfter != null) {
        await updateRedisCache(input.userId, txResult.balanceAfter)

        // Publish flux.credited event after commit
        await publishEvent({
          eventId: nanoid(),
          eventType: 'flux.credited',
          aggregateId: input.userId,
          userId: input.userId,
          requestId: input.stripeEventId,
          occurredAt: new Date().toISOString(),
          schemaVersion: 1,
          payload: {
            amount: input.fluxAmount,
            balanceAfter: txResult.balanceAfter,
            source: 'invoice.paid',
          },
        })
      }

      return txResult
    },
  }
}

export type BillingService = ReturnType<typeof createBillingService>
