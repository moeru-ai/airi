import type Redis from 'ioredis'

import type { Database } from '../libs/db'
import type { RevenueMetrics } from '../libs/otel'
import type { ConfigKVService } from './config-kv'
import type { OutboxService } from './outbox-service'

import { useLogger } from '@guiiai/logg'
import { eq } from 'drizzle-orm'

import { createPaymentRequiredError } from '../utils/error'
import { nanoid } from '../utils/id'
import { fluxRedisKey } from './flux'

import * as fluxSchema from '../schemas/flux'
import * as fluxAuditSchema from '../schemas/flux-audit-log'
import * as fluxLedgerSchema from '../schemas/flux-ledger'
import * as stripeSchema from '../schemas/stripe'

const logger = useLogger('billing-service')

export function createBillingService(
  db: Database,
  redis: Redis,
  outboxService: OutboxService,
  _configKV: ConfigKVService,
  metrics?: RevenueMetrics | null,
) {
  /**
   * Update Redis cache after a successful DB transaction.
   * Best-effort: cache loss is harmless since DB is the source of truth.
   */
  async function updateRedisCache(userId: string, balance: number): Promise<void> {
    try {
      await redis.set(fluxRedisKey(userId), String(balance))
    }
    catch {
      logger.withFields({ userId }).warn('Failed to update Redis cache after balance change')
    }
  }

  return {
    /**
     * Debit flux from a user's balance within a DB transaction.
     * Writes flux_ledger + flux_audit_log + outbox event atomically.
     */
    async debitFlux(input: {
      userId: string
      amount: number
      requestId?: string
      description?: string
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

        // 3. Append ledger entry
        await tx.insert(fluxLedgerSchema.fluxLedger).values({
          userId: input.userId,
          type: 'debit',
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          requestId: input.requestId,
          description: input.description ?? 'LLM request',
        })

        // 4. Append audit log (user-facing history)
        await tx.insert(fluxAuditSchema.fluxAuditLog).values({
          userId: input.userId,
          type: 'consumption',
          amount: -input.amount,
          description: input.description ?? 'LLM request',
        })

        // 5. Enqueue outbox event
        await outboxService.enqueue(tx, {
          eventId: nanoid(),
          eventType: 'flux.debited',
          aggregateId: input.userId,
          userId: input.userId,
          requestId: input.requestId,
          occurredAt: new Date().toISOString(),
          schemaVersion: 1,
          payload: {
            amount: input.amount,
            balanceAfter,
            source: 'llm.request',
          },
        })

        return { userId: input.userId, flux: balanceAfter }
      })

      // 6. Update Redis cache after commit (best-effort)
      await updateRedisCache(input.userId, result.flux)

      logger.withFields({ userId: input.userId, amount: input.amount, balance: result.flux }).log('Debited flux')
      return result
    },

    /**
     * Credit flux to a user's balance within a DB transaction.
     * Generic credit method for non-Stripe flows (e.g. admin grants).
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

        // Ledger entry
        await tx.insert(fluxLedgerSchema.fluxLedger).values({
          userId: input.userId,
          type: 'credit',
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          requestId: input.requestId,
          description: input.description,
        })

        // Audit log
        await tx.insert(fluxAuditSchema.fluxAuditLog).values({
          userId: input.userId,
          type: 'addition',
          amount: input.amount,
          description: input.description,
          metadata: input.auditMetadata,
        })

        // Outbox event
        await outboxService.enqueue(tx, {
          eventId: nanoid(),
          eventType: 'flux.credited',
          aggregateId: input.userId,
          userId: input.userId,
          requestId: input.requestId,
          occurredAt: new Date().toISOString(),
          schemaVersion: 1,
          payload: {
            amount: input.amount,
            balanceAfter,
            source: input.source,
          },
        })

        return { balanceBefore, balanceAfter }
      })

      await updateRedisCache(input.userId, result.balanceAfter)

      logger.withFields({ userId: input.userId, amount: input.amount, balance: result.balanceAfter }).log('Credited flux')
      return result
    },

    /**
     * Credit flux from a Stripe checkout session (one-time payment).
     * Idempotent: checks fluxCredited flag before applying.
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
        const record = await tx.query.stripeCheckoutSession.findFirst({
          where: (table, { eq }) => eq(table.stripeSessionId, input.stripeSessionId),
        })

        if (!record || record.fluxCredited) {
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

        // Mark checkout session as credited
        await tx.update(stripeSchema.stripeCheckoutSession)
          .set({ fluxCredited: true, updatedAt: new Date() })
          .where(eq(stripeSchema.stripeCheckoutSession.stripeSessionId, input.stripeSessionId))

        const description = `Stripe payment ${input.currency?.toUpperCase() ?? 'UNKNOWN'} ${(input.amountTotal / 100).toFixed(2)}`

        // Ledger entry
        await tx.insert(fluxLedgerSchema.fluxLedger).values({
          userId: input.userId,
          type: 'credit',
          amount: input.fluxAmount,
          balanceBefore,
          balanceAfter,
          requestId: input.stripeEventId,
          description,
        })

        // Audit log
        await tx.insert(fluxAuditSchema.fluxAuditLog).values({
          userId: input.userId,
          type: 'addition',
          amount: input.fluxAmount,
          description,
          metadata: {
            stripeEventId: input.stripeEventId,
            stripeSessionId: input.stripeSessionId,
            source: 'stripe.checkout.completed',
          },
        })

        // Outbox events
        const occurredAt = new Date().toISOString()
        await outboxService.enqueue(tx, {
          eventId: nanoid(),
          eventType: 'flux.credited',
          aggregateId: input.userId,
          userId: input.userId,
          requestId: input.stripeEventId,
          occurredAt,
          schemaVersion: 1,
          payload: {
            amount: input.fluxAmount,
            balanceAfter,
            source: 'stripe.checkout.completed',
          },
        })

        await outboxService.enqueue(tx, {
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

        return { applied: true, balanceAfter }
      })

      if (txResult.applied && txResult.balanceAfter != null) {
        await updateRedisCache(input.userId, txResult.balanceAfter)
      }

      return txResult
    },

    /**
     * Credit flux from a Stripe invoice payment (subscription).
     * Idempotent: checks fluxCredited flag on the invoice record.
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
        const record = await tx.query.stripeInvoice.findFirst({
          where: (table, { eq }) => eq(table.stripeInvoiceId, input.stripeInvoiceId),
        })

        if (!record || record.fluxCredited) {
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

        // Mark invoice as credited
        await tx.update(stripeSchema.stripeInvoice)
          .set({ fluxCredited: true, updatedAt: new Date() })
          .where(eq(stripeSchema.stripeInvoice.stripeInvoiceId, input.stripeInvoiceId))

        const description = `Subscription invoice ${input.currency.toUpperCase()} ${(input.amountPaid / 100).toFixed(2)}`

        // Ledger entry
        await tx.insert(fluxLedgerSchema.fluxLedger).values({
          userId: input.userId,
          type: 'credit',
          amount: input.fluxAmount,
          balanceBefore,
          balanceAfter,
          requestId: input.stripeEventId,
          description,
        })

        // Audit log
        await tx.insert(fluxAuditSchema.fluxAuditLog).values({
          userId: input.userId,
          type: 'addition',
          amount: input.fluxAmount,
          description,
          metadata: {
            stripeEventId: input.stripeEventId,
            stripeInvoiceId: input.stripeInvoiceId,
            source: 'invoice.paid',
          },
        })

        // Outbox event
        await outboxService.enqueue(tx, {
          eventId: nanoid(),
          eventType: 'flux.credited',
          aggregateId: input.userId,
          userId: input.userId,
          requestId: input.stripeEventId,
          occurredAt: new Date().toISOString(),
          schemaVersion: 1,
          payload: {
            amount: input.fluxAmount,
            balanceAfter,
            source: 'invoice.paid',
          },
        })

        return { applied: true, balanceAfter }
      })

      if (txResult.applied && txResult.balanceAfter != null) {
        await updateRedisCache(input.userId, txResult.balanceAfter)
      }

      return txResult
    },
  }
}

export type BillingService = ReturnType<typeof createBillingService>
