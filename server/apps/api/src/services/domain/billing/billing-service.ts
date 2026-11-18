import type Redis from 'ioredis'

import type { Database } from '../../../libs/db'
import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { CapacitorResetPolicy, FluxUsageInput } from './flux-posting'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { minValue, number, parse, pipe, safeInteger } from 'valibot'

import { nanoid } from '../../../utils/id'
import { invalidateBalanceCache } from '../flux-cache'
import { fluxUsageInputSchema, readCapacitorResetPolicy, refillCapacitor, settleOutstandingMicroFlux } from './flux-posting'
import { initializeWallet } from './wallet-initialization'

import * as fluxSchema from '../../../schemas/flux'
import * as fluxTxSchema from '../../../schemas/flux-transaction'
import * as fluxUsageSchema from '../../../schemas/flux-usage'

const logger = useLogger('billing-service')

/** Database handle used when the caller owns the outer transaction. */
export type BillingTransaction = Pick<Database, 'insert' | 'update' | 'select'>

/** The capacitor period that the payment channel reports as active now. */
export interface CapacitorPeriod {
  quota: number
  periodStart: Date
  expiresAt: Date
}

export function createBillingService(
  db: Database,
  redis: Redis,
  configKV: Pick<ConfigKVService, 'getOptional'>,
  metrics?: RevenueMetrics | null,
) {
  /**
   * Invalidate the wallet snapshot after a successful database transaction.
   * Best-effort: cache loss is harmless since DB is the source of truth.
   */
  async function updateRedisCache(userId: string): Promise<void> {
    try {
      await invalidateBalanceCache(redis, userId)
    }
    catch {
      logger.withFields({ userId }).warn('Failed to update Redis cache after balance change')
    }
  }

  async function lockWallet(tx: BillingTransaction, userId: string) {
    const [wallet] = await tx.select().from(fluxSchema.userFlux).where(and(
      eq(fluxSchema.userFlux.userId, userId),
      isNull(fluxSchema.userFlux.deletedAt),
    )).for('update')
    if (!wallet)
      throw new Error(`No active flux record for user ${userId}`)
    return wallet
  }

  /**
   * Refills the capacitor bucket when a refill is due, then settles integer debits from the shared pool.
   * The capacitor bucket pays first, then purchased Flux.
   */
  async function settleOutstanding(
    tx: BillingTransaction,
    stored: typeof fluxSchema.userFlux.$inferSelect,
    policy: CapacitorResetPolicy,
    operationId: string,
    usageId?: string,
  ) {
    const now = new Date()
    const wallet = refillCapacitor(stored, policy, now)
    if (wallet.refilled) {
      await tx.insert(fluxTxSchema.fluxTransaction).values({
        userId: wallet.userId,
        operationId: `${operationId}:refill`,
        type: 'credit',
        pool: 'capacitor',
        amount: wallet.capacitorQuota,
        balanceBefore: stored.capacitorFlux,
        balanceAfter: wallet.capacitorQuota,
        description: 'capacitor_refill',
        metadata: { source: 'capacitor.refill', periodStart: wallet.capacitorPeriodStart?.toISOString(), forfeited: stored.capacitorFlux },
      })
    }
    const settled = settleOutstandingMicroFlux(wallet, now)
    await tx.update(fluxSchema.userFlux).set({
      flux: settled.flux,
      capacitorFlux: settled.capacitorFlux,
      capacitorFilledAt: wallet.capacitorFilledAt,
      unsettledMicroFlux: settled.unsettledMicroFlux,
      updatedAt: now,
    }).where(eq(fluxSchema.userFlux.userId, wallet.userId))

    const metadata = { source: 'usage.settlement', usageId, unsettledBefore: wallet.unsettledMicroFlux, unsettledAfter: settled.unsettledMicroFlux }
    if (settled.fromPurchased > 0) {
      await tx.insert(fluxTxSchema.fluxTransaction).values({
        userId: wallet.userId,
        operationId,
        type: 'debit',
        pool: 'wallet',
        amount: settled.fromPurchased,
        balanceBefore: wallet.flux,
        balanceAfter: settled.flux,
        description: 'usage_settlement',
        metadata,
      })
    }
    if (settled.fromCapacitor > 0) {
      await tx.insert(fluxTxSchema.fluxTransaction).values({
        userId: wallet.userId,
        operationId: `${operationId}:capacitor`,
        type: 'debit',
        pool: 'capacitor',
        amount: settled.fromCapacitor,
        balanceBefore: wallet.capacitorFlux,
        balanceAfter: settled.capacitorFlux,
        description: 'usage_settlement',
        metadata,
      })
    }
    return { charged: settled.charged, requested: settled.requested, balance: settled.flux, unsettledMicroFlux: settled.unsettledMicroFlux }
  }

  return {
    /** Posts a confirmed fee once per source. The wallet row lock serializes pooled settlement. */
    async postFluxUsage(input: FluxUsageInput) {
      const command = parse(fluxUsageInputSchema, input)
      // The policy read needs its own pool client. It runs before the transaction, so a
      // settlement never holds one client while it waits for a second.
      const policy = await readCapacitorResetPolicy(configKV)
      const result = await db.transaction(async (tx) => {
        const wallet = await lockWallet(tx, command.userId)
        const [usage] = await tx.insert(fluxUsageSchema.fluxUsage).values({
          userId: command.userId,
          sourceType: command.source.type,
          sourceId: command.source.id,
          amountMicroFlux: command.amountMicroFlux,
          detail: command.detail,
        }).onConflictDoNothing().returning({ id: fluxUsageSchema.fluxUsage.id })
        if (!usage) {
          const [existing] = await tx.select({ amountMicroFlux: fluxUsageSchema.fluxUsage.amountMicroFlux }).from(fluxUsageSchema.fluxUsage).where(and(
            eq(fluxUsageSchema.fluxUsage.userId, command.userId),
            eq(fluxUsageSchema.fluxUsage.sourceType, command.source.type),
            eq(fluxUsageSchema.fluxUsage.sourceId, command.source.id),
          ))
          if (existing!.amountMicroFlux !== command.amountMicroFlux)
            throw new Error('Flux source replay does not match the posted amount')
          return { charged: 0, requested: 0, balance: wallet.flux, unsettledMicroFlux: wallet.unsettledMicroFlux, amountMicroFlux: command.amountMicroFlux, replay: true }
        }
        const outstanding = wallet.unsettledMicroFlux + command.amountMicroFlux
        parse(pipe(number(), safeInteger(), minValue(0)), outstanding)
        const settled = await settleOutstanding(tx, { ...wallet, unsettledMicroFlux: outstanding }, policy, `usage:${usage.id}:settle`, usage.id)
        return { ...settled, amountMicroFlux: command.amountMicroFlux, replay: false }
      })
      if (!result.replay)
        await updateRedisCache(command.userId)
      return result
    },

    /**
     * Reads authoritative admission state. Cached balances cannot authorize concurrent usage.
     * A due capacitor refill is written here with the settlement of outstanding fees.
     * A rejected request never reaches `postFluxUsage`, so a refill that is only counted
     * would pay the same outstanding fee again after each reset.
     */
    async getWallet(userId: string) {
      const policy = await readCapacitorResetPolicy(configKV)
      const [wallet] = await db.select().from(fluxSchema.userFlux).where(and(
        eq(fluxSchema.userFlux.userId, userId),
        isNull(fluxSchema.userFlux.deletedAt),
      ))
      if (!wallet)
        throw new Error(`No active flux record for user ${userId}`)
      if (!refillCapacitor(wallet, policy).refilled)
        return wallet

      const refilled = await db.transaction(async (tx) => {
        const locked = await lockWallet(tx, userId)
        // A concurrent admission or settlement can write the refill first.
        if (!refillCapacitor(locked, policy).refilled)
          return locked
        await settleOutstanding(tx, locked, policy, `admission:${nanoid()}:settle`)
        return lockWallet(tx, userId)
      })
      await updateRedisCache(userId)
      return refilled
    },

    /**
     * Stores the period that `resolve` returns. `null` means no active capacitor, so the capacitor expires now.
     * The refill rule then decides the grant: a later period start refills the bucket,
     * and the same or an earlier start keeps the spent amount.
     * A smaller quota caps the bucket.
     *
     * An advisory lock per user serializes syncs while `resolve` reads the payment channel.
     * The wallet row stays unlocked during that read, so debits are not blocked.
     * Returns the period that `resolve` gave.
     */
    async syncCapacitor(userId: string, resolve: () => Promise<CapacitorPeriod | null>): Promise<CapacitorPeriod | null> {
      const policy = await readCapacitorResetPolicy(configKV)
      // INITIAL_USER_FLUX has a zero default when no initial grant is configured.
      const initialFlux = await configKV.getOptional('INITIAL_USER_FLUX') ?? 0
      const synced = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
        const period = await resolve()
        const now = new Date()

        if (period)
          await initializeWallet(tx, userId, initialFlux)
        const [wallet] = await tx.select().from(fluxSchema.userFlux).where(and(
          eq(fluxSchema.userFlux.userId, userId),
          isNull(fluxSchema.userFlux.deletedAt),
        )).for('update')
        if (!wallet)
          return period

        if (!period) {
          if (wallet.capacitorExpiresAt !== null && wallet.capacitorExpiresAt > now)
            await tx.update(fluxSchema.userFlux).set({ capacitorExpiresAt: now, updatedAt: now }).where(eq(fluxSchema.userFlux.userId, userId))
          return period
        }

        const operationId = `capacitor:${nanoid()}`
        const capacitor = {
          capacitorFlux: Math.min(wallet.capacitorFlux, period.quota),
          capacitorQuota: period.quota,
          capacitorExpiresAt: period.expiresAt,
          capacitorPeriodStart: period.periodStart,
        }
        await tx.update(fluxSchema.userFlux).set(capacitor).where(eq(fluxSchema.userFlux.userId, userId))
        if (capacitor.capacitorFlux < wallet.capacitorFlux) {
          await tx.insert(fluxTxSchema.fluxTransaction).values({
            userId,
            operationId: `${operationId}:cap`,
            type: 'debit',
            pool: 'capacitor',
            amount: wallet.capacitorFlux - capacitor.capacitorFlux,
            balanceBefore: wallet.capacitorFlux,
            balanceAfter: capacitor.capacitorFlux,
            description: 'capacitor_quota_cap',
            metadata: { source: 'capacitor.quota_cap', quota: period.quota },
          })
        }
        await settleOutstanding(tx, { ...wallet, ...capacitor }, policy, `${operationId}:settle`)
        return period
      })
      await updateRedisCache(userId)
      return synced
    },

    /** Chooses whether purchased Flux pays after the capacitor bucket runs out. Needs an initialized wallet. */
    async setFallbackToFlux(userId: string, fallbackToFlux: boolean): Promise<void> {
      const updated = await db.update(fluxSchema.userFlux)
        .set({ fallbackToFlux, updatedAt: new Date() })
        .where(and(eq(fluxSchema.userFlux.userId, userId), isNull(fluxSchema.userFlux.deletedAt)))
        .returning({ userId: fluxSchema.userFlux.userId })
      if (updated.length === 0)
        throw new Error(`No active flux record for user ${userId}`)
      await updateRedisCache(userId)
    },

    /** Credits integer Flux, then settles affordable outstanding fees in the same transaction. Replay returns the current wallet balance. */
    async creditFlux(input: {
      userId: string
      amount: number
      requestId?: string
      description: string
      source: string
      /**
       * Ledger row `type`. Defaults to `'credit'` for pack credits.
       * Admin promo grants pass `'promo'` so reports can distinguish them.
       */
      type?: 'credit' | 'promo'
      auditMetadata?: Record<string, unknown>
      /**
       * When Payment CORE already opened a transaction, write through that
       * handle and skip the Redis cache update. Caller must call
       * `syncFluxCache` after the outer transaction commits.
       */
      tx?: BillingTransaction
    }): Promise<{ balanceBefore: number, balanceAfter: number, fluxTransactionId: string, idempotent: boolean }> {
      parse(pipe(number(), safeInteger(), minValue(1)), input.amount)
      const ledgerType = input.type ?? 'credit'

      // With `input.tx`, the caller already holds a client. That path is a purchase, not the request path.
      const policy = await readCapacitorResetPolicy(configKV)
      const writeCredit = async (tx: BillingTransaction) => {
        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [row] = await tx
          .select()
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

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
              balanceAfter: row!.flux,
              fluxTransactionId: existing.id,
              idempotent: true,
            }
          }
        }

        if (!row || row.deletedAt !== null)
          throw new Error('Cannot credit a deleted wallet')
        const balanceBefore = row.flux
        const balanceAfter = balanceBefore + input.amount
        parse(pipe(number(), safeInteger(), minValue(0)), balanceAfter)

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

        const settled = await settleOutstanding(tx, { ...row!, flux: balanceAfter }, policy, `credit:${insertedTx!.id}:settle`)
        return {
          balanceBefore,
          balanceAfter: settled.balance,
          fluxTransactionId: insertedTx!.id,
          idempotent: false,
        }
      }

      const txResult = input.tx
        ? await writeCredit(input.tx)
        : await db.transaction(async tx => writeCredit(tx))

      if (txResult.idempotent) {
        logger.withFields({
          userId: input.userId,
          requestId: input.requestId,
          fluxTransactionId: txResult.fluxTransactionId,
        }).log('Credited flux (idempotent replay — no side effects emitted)')
        return txResult
      }

      if (!input.tx) {
        await updateRedisCache(input.userId)
        metrics?.fluxCredited.add(input.amount, { source: input.source, type: ledgerType })
      }

      logger.withFields({ userId: input.userId, amount: input.amount, balance: txResult.balanceAfter }).log('Credited flux')
      return txResult
    },

    async syncFluxCache(userId: string, credited?: { amount: number, source: string }): Promise<void> {
      await updateRedisCache(userId)
      if (credited)
        metrics?.fluxCredited.add(credited.amount, { source: credited.source, type: 'credit' })
    },

    /** Sets the integer balance and preserves outstanding fees. The admin adjustment remains a separate ledger fact. */
    async setFlux(input: {
      userId: string
      balance: number
      description: string
      issuedByUserId: string
    }): Promise<{ balanceBefore: number, balanceAfter: number, fluxTransactionId: string }> {
      parse(pipe(number(), safeInteger(), minValue(0)), input.balance)
      const txResult = await db.transaction(async (tx) => {
        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [row] = await tx
          .select()
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        if (!row || row.deletedAt !== null)
          throw new Error('Cannot adjust a deleted wallet')
        const balanceBefore = row.flux
        const balanceAfter = input.balance
        const delta = balanceAfter - balanceBefore

        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        const [insertedTx] = await tx.insert(fluxTxSchema.fluxTransaction).values({
          userId: input.userId,
          type: 'admin_set',
          amount: Math.abs(delta),
          balanceBefore,
          balanceAfter,
          description: input.description,
          metadata: {
            source: 'admin_set',
            requestedBalance: input.balance,
            direction: delta >= 0 ? 'credit' : 'debit',
            issuedByUserId: input.issuedByUserId,
          },
        }).returning({ id: fluxTxSchema.fluxTransaction.id })

        return { balanceBefore, balanceAfter, fluxTransactionId: insertedTx!.id }
      })

      // Invalidation prevents a balance-only write from hiding confirmed outstanding fees.
      try {
        await invalidateBalanceCache(redis, input.userId)
      }
      catch {
        logger.withFields({ userId: input.userId }).warn('Failed to invalidate flux cache after setFlux')
      }

      logger.withFields({
        userId: input.userId,
        balanceBefore: txResult.balanceBefore,
        balanceAfter: txResult.balanceAfter,
        issuedByUserId: input.issuedByUserId,
      }).log('Set flux balance')

      return txResult
    },
  }
}

export type BillingService = ReturnType<typeof createBillingService>
