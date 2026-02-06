import type * as fullSchema from '../schemas'
import type { Database } from './db'

import { eq } from 'drizzle-orm'

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
      const record = await this.getFlux(userId)
      if (record.flux < amount) {
        throw new Error('Insufficient flux')
      }

      const [updated] = await db.update(schema.userFlux)
        .set({
          flux: record.flux - amount,
          updatedAt: new Date(),
        })
        .where(eq(schema.userFlux.userId, userId))
        .returning()

      return updated
    },

    async addFlux(userId: string, amount: number) {
      const record = await this.getFlux(userId)
      const [updated] = await db.update(schema.userFlux)
        .set({
          flux: record.flux + amount,
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
