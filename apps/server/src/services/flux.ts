import type Redis from 'ioredis'

import type { Database } from '../libs/db'
import type { ConfigKVService } from './config-kv'

import { useLogger } from '@guiiai/logg'
import { eq } from 'drizzle-orm'

import { userFluxRedisKey } from '../utils/redis-keys'

import * as schema from '../schemas/flux'
import * as fluxTxSchema from '../schemas/flux-transaction'

const logger = useLogger('flux-service')

export function createFluxService(db: Database, redis: Redis, configKV: ConfigKVService) {
  return {
    async getFlux(userId: string) {
      // 1. Try Redis cache
      const cached = await redis.get(userFluxRedisKey(userId))
      if (cached !== null) {
        return { userId, flux: Number.parseInt(cached, 10) }
      }

      // 2. Cache miss — load from DB
      let record = await db.query.userFlux.findFirst({
        where: eq(schema.userFlux.userId, userId),
      })

      if (!record) {
        const initialFlux = await configKV.getOrThrow('INITIAL_USER_FLUX')

        // Transaction: create user_flux + flux_transaction atomically
        await db.transaction(async (tx) => {
          const [inserted] = await tx.insert(schema.userFlux)
            .values({ userId, flux: initialFlux })
            .onConflictDoNothing({ target: schema.userFlux.userId })
            .returning()

          // Only write transaction if we actually created the record (not a conflict)
          if (inserted) {
            await tx.insert(fluxTxSchema.fluxTransaction).values({
              userId,
              type: 'initial',
              amount: initialFlux,
              balanceBefore: 0,
              balanceAfter: initialFlux,
              description: 'Initial grant',
            })
          }
        })

        // Re-read to handle race condition (another request may have initialized first)
        record = await db.query.userFlux.findFirst({
          where: eq(schema.userFlux.userId, userId),
        })

        if (!record) {
          throw new Error(`Failed to initialize flux for user ${userId}`)
        }

        logger.withFields({ userId, initialFlux }).log('Initialized new user flux')
      }

      // 3. Populate Redis cache
      await redis.set(userFluxRedisKey(userId), String(record.flux))

      return record
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
