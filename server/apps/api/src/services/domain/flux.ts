import type Redis from 'ioredis'

import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../adapters/config-kv'
import type { WalletSnapshot } from './flux-cache'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull } from 'drizzle-orm'

import { capacitorPercent, readCapacitorResetPolicy, refillCapacitor } from './billing/flux-posting'
import { invalidateBalanceCache, readBalanceCache, writeBalanceCache } from './flux-cache'

import * as schema from '../../schemas/flux'
import * as fluxTxSchema from '../../schemas/flux-transaction'

const logger = useLogger('flux-service')

// NOTICE:
// All read paths here treat soft-deleted rows (`deletedAt IS NOT NULL`) as
// invisible. After account deletion the auth tables hard-delete the user
// so this filter is mostly defense-in-depth against routes that bypass
// `sessionMiddleware`. See `server/apps/api/docs/ai-context/account-deletion.md`.
/** Capacitor expiry is judged on every read, so a cached snapshot never shows an expired capacitor. */
function toBalance(userId: string, snapshot: WalletSnapshot) {
  return {
    userId,
    flux: snapshot.flux,
    unsettledMicroFlux: snapshot.unsettledMicroFlux,
    fallbackToFlux: snapshot.fallbackToFlux,
    capacitorPercent: capacitorPercent({
      capacitorFlux: snapshot.capacitorFlux,
      capacitorQuota: snapshot.capacitorQuota,
      capacitorExpiresAt: snapshot.capacitorExpiresAt === null ? null : new Date(snapshot.capacitorExpiresAt),
    }),
  }
}

export function createFluxService(db: Database, redis: Redis, configKV: ConfigKVService) {
  return {
    async getFlux(userId: string) {
      const cached = await readBalanceCache(redis, userId)
      if (cached !== null)
        return toBalance(userId, cached)

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

      // A due capacitor refill is counted in the snapshot. The cache can show the old amount for its TTL after a reset.
      const snapshot = {
        flux: record.flux,
        unsettledMicroFlux: record.unsettledMicroFlux,
        capacitorFlux: refillCapacitor(record, await readCapacitorResetPolicy(configKV)).capacitorFlux,
        capacitorQuota: record.capacitorQuota,
        capacitorExpiresAt: record.capacitorExpiresAt?.toISOString() ?? null,
        fallbackToFlux: record.fallbackToFlux,
      }
      await writeBalanceCache(redis, userId, snapshot)
      return toBalance(userId, snapshot)
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
      await invalidateBalanceCache(redis, userId)

      logger
        .withFields({ userId, clearedFlux: result[0]?.flux ?? 0 })
        .log('Flux balance soft-deleted and cache invalidated')
    },
  }
}

export type FluxService = ReturnType<typeof createFluxService>
