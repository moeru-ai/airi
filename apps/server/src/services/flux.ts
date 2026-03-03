import type * as fullSchema from '../schemas'
import type { Database } from './db'

import { and, eq, gte, sql } from 'drizzle-orm'

import * as schema from '../schemas/flux'

export function createFluxService(db: Database<typeof fullSchema>) {
  return {
    async getFlux(userId: string) {
      let record = await db.query.userFlux.findFirst({
        where: eq(schema.userFlux.userId, userId),
      })

      if (!record) {
        [record] = await db.insert(schema.userFlux).values({
          userId,
          flux: 100, // Default initial flux
        }).returning()
      }

      return record
    },

    async consumeFlux(userId: string, amount: number) {
      // Ensure the user has a flux record
      await this.getFlux(userId)

      // Atomic check-and-deduct to prevent race conditions
      const result = await db.update(schema.userFlux)
        .set({
          flux: sql`${schema.userFlux.flux} - ${amount}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.userFlux.userId, userId),
          gte(schema.userFlux.flux, amount),
        ))
        .returning()

      if (result.length === 0) {
        throw new Error('Insufficient flux')
      }

      return result[0]
    },

    async addFlux(userId: string, amount: number) {
      // Ensure the user has a flux record
      await this.getFlux(userId)

      // Atomic addition to prevent race conditions
      const [updated] = await db.update(schema.userFlux)
        .set({
          flux: sql`${schema.userFlux.flux} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.userFlux.userId, userId))
        .returning()

      return updated
    },

    async updateStripeCustomerId(userId: string, stripeCustomerId: string) {
      const [updated] = await db.update(schema.userFlux)
        .set({
          stripeCustomerId,
          updatedAt: new Date(),
        })
        .where(eq(schema.userFlux.userId, userId))
        .returning()

      return updated
    },
  }
}

export type FluxService = ReturnType<typeof createFluxService>
