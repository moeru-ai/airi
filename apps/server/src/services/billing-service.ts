import type { Database } from '../libs/db'
import type { OutboxService } from './outbox-service'

import { eq, sql } from 'drizzle-orm'

import { nanoid } from '../utils/id'

import * as fluxSchema from '../schemas/flux'
import * as fluxAuditSchema from '../schemas/flux-audit-log'
import * as stripeSchema from '../schemas/stripe'

export function createBillingService(db: Database, outboxService: OutboxService) {
  return {
    async creditFluxFromStripeCheckout(input: {
      stripeEventId: string
      userId: string
      stripeSessionId: string
      amountTotal: number
      currency: string | null
      fluxAmount: number
    }): Promise<{ applied: boolean, balanceAfter?: number }> {
      return db.transaction(async (tx) => {
        const record = await tx.query.stripeCheckoutSession.findFirst({
          where: (table, { eq }) => eq(table.stripeSessionId, input.stripeSessionId),
        })

        if (!record || record.fluxCredited) {
          return { applied: false }
        }

        await tx.insert(fluxSchema.userFlux)
          .values({
            userId: input.userId,
            flux: 0,
          })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [updatedFlux] = await tx.update(fluxSchema.userFlux)
          .set({
            flux: sql`${fluxSchema.userFlux.flux} + ${input.fluxAmount}`,
            updatedAt: new Date(),
          })
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .returning({
            flux: fluxSchema.userFlux.flux,
          })

        if (!updatedFlux) {
          throw new Error(`Failed to update flux balance for user ${input.userId}`)
        }

        await tx.update(stripeSchema.stripeCheckoutSession)
          .set({
            fluxCredited: true,
            updatedAt: new Date(),
          })
          .where(eq(stripeSchema.stripeCheckoutSession.stripeSessionId, input.stripeSessionId))

        await tx.insert(fluxAuditSchema.fluxAuditLog).values({
          userId: input.userId,
          type: 'addition',
          amount: input.fluxAmount,
          description: `Stripe payment ${input.currency?.toUpperCase() ?? 'UNKNOWN'} ${(input.amountTotal / 100).toFixed(2)}`,
          metadata: {
            stripeEventId: input.stripeEventId,
            stripeSessionId: input.stripeSessionId,
            source: 'stripe.checkout.completed',
          },
        })

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
            balanceAfter: updatedFlux.flux,
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

        return {
          applied: true,
          balanceAfter: updatedFlux.flux,
        }
      })
    },
  }
}

export type BillingService = ReturnType<typeof createBillingService>
