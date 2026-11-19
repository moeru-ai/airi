import type Redis from 'ioredis'

import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../adapters/config-kv'
import type { WalletSnapshot } from './flux-cache'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'

import { fluxTransaction } from '../../schemas/flux-transaction'
import { capacitorPercent, nextCapacitorRecharge, readCapacitorResetPolicy, refillCapacitor } from './billing/flux-posting'
import { initializeWallet } from './billing/wallet-initialization'
import { invalidateBalanceCache, readBalanceCache, writeBalanceCache } from './flux-cache'

import * as schema from '../../schemas/flux'

const logger = useLogger('flux-service')

/** The most debit rows that one usage read returns. A window with more debits shows its latest part. */
const CAPACITOR_USAGE_LIMIT = 500

const noCapacitorUsage: { startedAt: string | null, endsAt: string | null, records: { at: string, percent: number }[] } = { startedAt: null, endsAt: null, records: [] }

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
    // A cached time that has passed is not shown. The next uncached read gives the new one.
    capacitorRechargesAt: snapshot.capacitorRechargesAt !== null && new Date(snapshot.capacitorRechargesAt) > new Date()
      ? snapshot.capacitorRechargesAt
      : null,
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

        await db.transaction(async (tx) => {
          await initializeWallet(tx, userId, initialFlux)
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
      const policy = await readCapacitorResetPolicy(configKV)
      const snapshot = {
        flux: record.flux,
        unsettledMicroFlux: record.unsettledMicroFlux,
        capacitorFlux: refillCapacitor(record, policy).capacitorFlux,
        capacitorQuota: record.capacitorQuota,
        capacitorExpiresAt: record.capacitorExpiresAt?.toISOString() ?? null,
        capacitorRechargesAt: nextCapacitorRecharge(record, policy)?.toISOString() ?? null,
        fallbackToFlux: record.fallbackToFlux,
      }
      await writeBalanceCache(redis, userId, snapshot)
      return toBalance(userId, snapshot)
    },

    /**
     * Lists the Capacitor percent after each debit of the current refill window.
     * The window starts at the last refill. It ends at the next recharge, or at expiry without a reset interval.
     * The response has percents only, the same as the balance read.
     */
    async getCapacitorUsage(userId: string, now: Date = new Date()) {
      const record = await db.query.userFlux.findFirst({
        where: and(
          eq(schema.userFlux.userId, userId),
          isNull(schema.userFlux.deletedAt),
        ),
      })
      if (!record || record.capacitorExpiresAt === null || record.capacitorExpiresAt <= now || record.capacitorQuota <= 0)
        return noCapacitorUsage

      const policy = await readCapacitorResetPolicy(configKV)
      const window = refillCapacitor(record, policy, now)
      if (window.capacitorFilledAt === null)
        return noCapacitorUsage

      // A due refill that no request has written yet starts a full window. The stored debits belong to the window before it.
      const rows = window.refilled
        ? []
        : await db.select({ createdAt: fluxTransaction.createdAt, balanceAfter: fluxTransaction.balanceAfter })
            .from(fluxTransaction)
            .where(and(
              eq(fluxTransaction.userId, userId),
              eq(fluxTransaction.pool, 'capacitor'),
              eq(fluxTransaction.type, 'debit'),
              gte(fluxTransaction.createdAt, window.capacitorFilledAt),
            ))
            .orderBy(desc(fluxTransaction.createdAt), desc(fluxTransaction.id))
            .limit(CAPACITOR_USAGE_LIMIT)

      const endsAt = nextCapacitorRecharge(record, policy, now) ?? record.capacitorExpiresAt
      return {
        startedAt: window.capacitorFilledAt.toISOString(),
        endsAt: endsAt.toISOString(),
        records: rows.reverse().map(row => ({
          at: row.createdAt.toISOString(),
          percent: Math.min(100, Math.max(0, Math.round(row.balanceAfter / record.capacitorQuota * 100))),
        })),
      }
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
