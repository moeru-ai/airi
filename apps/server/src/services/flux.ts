import type Redis from 'ioredis'

import type { Database } from '../libs/db'
import type { ConfigKVService } from './config-kv'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull } from 'drizzle-orm'

import { userFluxRedisKey } from '../utils/redis-keys'

import * as schema from '../schemas/flux'
import * as fluxTxSchema from '../schemas/flux-transaction'

const logger = useLogger('flux-service')

// NOTICE:
// All read paths here treat soft-deleted rows (`deletedAt IS NOT NULL`) as
// invisible. After account deletion the auth tables hard-delete the user
// so this filter is mostly defense-in-depth against routes that bypass
// `sessionMiddleware`. See `apps/server/docs/ai-context/account-deletion.md`.
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
        where: and(
          eq(schema.userFlux.userId, userId),
          isNull(schema.userFlux.deletedAt),
        ),
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
          where: and(
            eq(schema.userFlux.userId, userId),
            isNull(schema.userFlux.deletedAt),
          ),
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
        .where(and(
          eq(schema.userFlux.userId, userId),
          isNull(schema.userFlux.deletedAt),
        ))
        .returning()

      return updated
    },

    /**
     * Soft-delete the user's flux balance and drop the cached value from
     * Redis. Does NOT touch `flux_transaction` — that ledger is preserved
     * across user deletion for billing audit (and the table has no
     * `deletedAt` column by design).
     *
     * Idempotent: `WHERE deletedAt IS NULL` skips an already-stamped row,
     * `redis.del` is a no-op when the key is absent.
     */
    async deleteAllForUser(userId: string) {
      const now = new Date()

      const result = await db.update(schema.userFlux)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.userFlux.userId, userId),
          isNull(schema.userFlux.deletedAt),
        ))
        .returning({ flux: schema.userFlux.flux })

      // Drop the cached balance so any in-flight read does not see a
      // ghost balance for the soft-deleted user.
      await redis.del(userFluxRedisKey(userId))

      logger
        .withFields({ userId, clearedFlux: result[0]?.flux ?? 0 })
        .log('Flux balance soft-deleted and cache invalidated')
    },
  }
}

export type FluxService = ReturnType<typeof createFluxService>
