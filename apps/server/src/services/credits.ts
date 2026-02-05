import type * as fullSchema from '../schemas'
import type { Database } from './db'

import { eq } from 'drizzle-orm'

import * as schema from '../schemas/credits'

export function createCreditsService(db: Database<typeof fullSchema>) {
  return {
    async getCredits(userId: string) {
      let record = await db.query.userCredits.findFirst({
        where: eq(schema.userCredits.userId, userId),
      })

      if (!record) {
        [record] = await db.insert(schema.userCredits).values({
          userId,
          credits: 100, // Default initial credits
        }).returning()
      }

      return record
    },

    async consumeCredits(userId: string, amount: number) {
      const record = await this.getCredits(userId)
      if (record.credits < amount) {
        throw new Error('Insufficient credits')
      }

      const [updated] = await db.update(schema.userCredits)
        .set({
          credits: record.credits - amount,
          updatedAt: new Date(),
        })
        .where(eq(schema.userCredits.userId, userId))
        .returning()

      return updated
    },

    async addCredits(userId: string, amount: number) {
      const record = await this.getCredits(userId)
      const [updated] = await db.update(schema.userCredits)
        .set({
          credits: record.credits + amount,
          updatedAt: new Date(),
        })
        .where(eq(schema.userCredits.userId, userId))
        .returning()

      return updated
    },

    async updateStripeCustomerId(userId: string, stripeCustomerId: string) {
      const [updated] = await db.update(schema.userCredits)
        .set({
          stripeCustomerId,
          updatedAt: new Date(),
        })
        .where(eq(schema.userCredits.userId, userId))
        .returning()

      return updated
    },
  }
}

export type CreditsService = ReturnType<typeof createCreditsService>
