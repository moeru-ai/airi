import type Redis from 'ioredis'

import type { Database } from '../../libs/db'
import type { RevenueMetrics } from '../../otel'
import type { ConfigKVService } from '../config-kv'

import { useLogger } from '@guiiai/logg'
import { and, eq } from 'drizzle-orm'

import { createPaymentRequiredError } from '../../utils/error'
import { userFluxRedisKey } from '../../utils/redis-keys'

import * as fluxSchema from '../../schemas/flux'
import * as fluxTxSchema from '../../schemas/flux-transaction'
import * as stripeSchema from '../../schemas/stripe'

const logger = useLogger('billing-service')

export function createBillingService(
  db: Database,
  redis: Redis,
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
   * Debit flux from a user's balance within a single DB transaction.
   *
   * The transaction locks the user_flux row, validates the balance, updates
   * it, and writes the matching `flux_transaction` ledger entry — all in one
   * commit. The unique partial index `(user_id, request_id) WHERE request_id IS NOT NULL`
   * keeps retries idempotent at the DB level.
   *
   * Partial-debit semantics:
   * When `0 < balance < amount`, the balance is drained to zero and the
   * ledger row is written with `amount = charged` and metadata recording
   * `requestedAmount` + `unbilled`. The function returns `charged < requested`
   * so callers can attribute the delta to a metric counter. This prevents
   * the post-streaming leak where a partial-balance user could replay the
   * same request indefinitely (each attempt rolled back the whole tx,
   * leaving the balance untouched). The very next call sees `flux <= 0`
   * and hits the throw branch.
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
  }): Promise<{ userId: string, flux: number, charged: number, requested: number }> {
    const result = await db.transaction(async (tx) => {
      // Idempotency: a previous successful debit with the same requestId
      // returns the prior post-balance and skips the second deduction.
      // Mirrors creditFlux's idempotent path so retries (network errors,
      // worker restarts) don't double-charge.
      if (input.requestId != null) {
        const [existing] = await tx
          .select({
            amount: fluxTxSchema.fluxTransaction.amount,
            balanceAfter: fluxTxSchema.fluxTransaction.balanceAfter,
          })
          .from(fluxTxSchema.fluxTransaction)
          .where(and(
            eq(fluxTxSchema.fluxTransaction.userId, input.userId),
            eq(fluxTxSchema.fluxTransaction.requestId, input.requestId),
          ))
          .limit(1)

        if (existing) {
          // Replay reuses the historical `charged`; we deliberately reflect
          // the original (possibly partial) outcome instead of the caller's
          // current `amount`, so the caller doesn't double-fire unbilled
          // counters on retries.
          return {
            userId: input.userId,
            flux: existing.balanceAfter,
            charged: existing.amount,
            requested: existing.amount,
            idempotent: true as const,
          }
        }
      }

      const [row] = await tx
        .select({ flux: fluxSchema.userFlux.flux })
        .from(fluxSchema.userFlux)
        .where(eq(fluxSchema.userFlux.userId, input.userId))
        .for('update')

      if (!row) {
        throw new Error(`No flux record for user ${input.userId}`)
      }

      const balanceBefore = row.flux
      // Hard floor: zero (or somehow negative) balance still throws so
      // streaming callers' catch path fires `fluxUnbilled` with the full
      // amount and TTS meter restores its debt counter. Partial debit only
      // kicks in when there is *some* balance left to drain.
      if (balanceBefore <= 0) {
        metrics?.fluxInsufficientBalance.add(1)
        throw createPaymentRequiredError('Insufficient flux')
      }

      const chargedAmount = Math.min(input.amount, balanceBefore)
      const balanceAfter = balanceBefore - chargedAmount
      const isPartial = chargedAmount < input.amount
      if (isPartial) {
        metrics?.fluxInsufficientBalance.add(1)
      }

      await tx.update(fluxSchema.userFlux)
        .set({ flux: balanceAfter, updatedAt: new Date() })
        .where(eq(fluxSchema.userFlux.userId, input.userId))

      await tx.insert(fluxTxSchema.fluxTransaction).values({
        userId: input.userId,
        type: 'debit',
        amount: chargedAmount,
        balanceBefore,
        balanceAfter,
        requestId: input.requestId,
        description: input.description ?? input.source,
        metadata: {
          ...input.metadata,
          source: input.source,
          ...(isPartial && {
            requestedAmount: input.amount,
            unbilled: input.amount - chargedAmount,
          }),
        },
      })

      return {
        userId: input.userId,
        flux: balanceAfter,
        charged: chargedAmount,
        requested: input.amount,
        idempotent: false as const,
      }
    })

    if (!result.idempotent) {
      await updateRedisCache(input.userId, result.flux)
    }

    logger.withFields({
      userId: input.userId,
      amount: input.amount,
      charged: result.charged,
      balance: result.flux,
      idempotent: result.idempotent,
    }).log('Debited flux')
    return {
      userId: result.userId,
      flux: result.flux,
      charged: result.charged,
      requested: result.requested,
    }
  }

  return {
    /**
     * Debit flux for an LLM API request (chat, TTS).
     * Token usage is persisted in the `flux_transaction.metadata` column so
     * the existing transaction-history UI can render per-request token counts.
     */
    async consumeFluxForLLM(input: {
      userId: string
      amount: number
      requestId?: string
      description?: string
      model?: string
      promptTokens?: number
      completionTokens?: number
    }): Promise<{ userId: string, flux: number, charged: number, requested: number }> {
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
     *
     * Idempotency:
     * When `requestId` is provided, the call is idempotent across crash /
     * retry boundaries. If a `flux_transaction` row with the same
     * `(user_id, request_id)` already exists, this method returns that
     * existing row's balance + id without re-crediting the user, without
     * touching `user_flux`, and without re-emitting the Redis cache write.
     *
     * This guards against the worker crash window where:
     * 1. `creditFlux` commits the credit
     * 2. caller crashes before marking its own state (e.g. recipient row) granted
     * 3. on restart, caller sees pending state and calls `creditFlux` again with same requestId
     *
     * Without idempotency, step 3 would hit the `(user_id, request_id)`
     * unique index and throw — causing the caller to mark the work failed
     * even though the user was already credited.
     */
    async creditFlux(input: {
      userId: string
      amount: number
      requestId?: string
      description: string
      source: string
      /**
       * Ledger row `type`. Defaults to `'credit'` for backward compatibility
       * with existing callers (Stripe top-up). Admin promo grants pass
       * `'promo'` so reports / dashboards can distinguish them.
       */
      type?: 'credit' | 'promo'
      auditMetadata?: Record<string, unknown>
    }): Promise<{ balanceBefore: number, balanceAfter: number, fluxTransactionId: string, idempotent: boolean }> {
      const ledgerType = input.type ?? 'credit'

      const txResult = await db.transaction(async (tx) => {
        if (input.requestId != null) {
          const [existing] = await tx
            .select({
              id: fluxTxSchema.fluxTransaction.id,
              balanceBefore: fluxTxSchema.fluxTransaction.balanceBefore,
              balanceAfter: fluxTxSchema.fluxTransaction.balanceAfter,
            })
            .from(fluxTxSchema.fluxTransaction)
            .where(and(
              eq(fluxTxSchema.fluxTransaction.userId, input.userId),
              eq(fluxTxSchema.fluxTransaction.requestId, input.requestId),
            ))
            .limit(1)

          if (existing) {
            return {
              balanceBefore: existing.balanceBefore,
              balanceAfter: existing.balanceAfter,
              fluxTransactionId: existing.id,
              idempotent: true,
            }
          }
        }

        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [row] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = row!.flux
        const balanceAfter = balanceBefore + input.amount

        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        const [insertedTx] = await tx.insert(fluxTxSchema.fluxTransaction).values({
          userId: input.userId,
          type: ledgerType,
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          requestId: input.requestId,
          description: input.description,
          metadata: input.auditMetadata,
        }).returning({ id: fluxTxSchema.fluxTransaction.id })

        return {
          balanceBefore,
          balanceAfter,
          fluxTransactionId: insertedTx!.id,
          idempotent: false,
        }
      })

      if (txResult.idempotent) {
        logger.withFields({
          userId: input.userId,
          requestId: input.requestId,
          fluxTransactionId: txResult.fluxTransactionId,
        }).log('Credited flux (idempotent replay — no side effects emitted)')
        return txResult
      }

      await updateRedisCache(input.userId, txResult.balanceAfter)
      metrics?.fluxCredited.add(input.amount, { source: input.source, type: ledgerType })

      logger.withFields({ userId: input.userId, amount: input.amount, balance: txResult.balanceAfter }).log('Credited flux')
      return txResult
    },

    /**
     * Credit flux from a Stripe checkout session (one-time payment).
     * Idempotent: claims the checkout session row by flipping `fluxCredited`
     * from false to true; replays of the same Stripe event observe the row
     * already claimed and apply nothing.
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

        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [currentFlux] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = currentFlux!.flux
        const balanceAfter = balanceBefore + input.fluxAmount

        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        const description = `Stripe payment ${input.currency?.toUpperCase() ?? 'UNKNOWN'} ${(input.amountTotal / 100).toFixed(2)}`

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
        metrics?.fluxCredited.add(input.fluxAmount, { source: 'stripe.checkout', type: 'credit' })
      }

      return txResult
    },

    /**
     * Credit flux from a Stripe invoice payment (subscription).
     * Idempotent: claims the invoice row by flipping `fluxCredited`
     * from false to true; replays observe it already claimed and apply nothing.
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

        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [currentFlux] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = currentFlux!.flux
        const balanceAfter = balanceBefore + input.fluxAmount

        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        const description = `Subscription invoice ${input.currency.toUpperCase()} ${(input.amountPaid / 100).toFixed(2)}`

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
        metrics?.fluxCredited.add(input.fluxAmount, { source: 'stripe.invoice', type: 'credit' })
      }

      return txResult
    },
  }
}

export type BillingService = ReturnType<typeof createBillingService>
