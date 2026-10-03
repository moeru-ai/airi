import type Redis from 'ioredis'

import type { Database } from '../../../libs/db'
import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { RequestObservation } from '../generation-observation'
import type { ConfirmedUsage, CostPricing, CostUsage, SpeechPricing } from './billing'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull } from 'drizzle-orm'
import { minValue, nonEmpty, number, object, parse, picklist, pipe, safeInteger, string } from 'valibot'

import { fluxUsage } from '../../../schemas/flux-usage'
import { invalidateBalanceCache } from '../flux-cache'
import { generationObservationSchema } from '../generation-observation'
import { billingPolicySchema, confirmedUsageSchema, costPricingSchema, MICRO_FLUX_PER_FLUX, priceLlmCost, priceSpeechUsage, speechPricingSchema } from './billing'

import * as fluxSchema from '../../../schemas/flux'
import * as fluxTxSchema from '../../../schemas/flux-transaction'

const logger = useLogger('billing-service')

const settlementMethod = { unresolved: 'unresolved', providerCost: 'provider_cost' }
const settlementStatus = { pending: 'pending', settled: 'settled', cancelled: 'cancelled' }

type SettlementTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Database handle used when Payment CORE already owns the outer transaction. */
export type BillingTransaction = Pick<Database, 'insert' | 'update' | 'select'>

export function createBillingService(
  db: Database,
  redis: Redis,
  _configKV: ConfigKVService,
  metrics?: RevenueMetrics | null,
) {
  /**
   * Invalidate the wallet snapshot after a successful database transaction.
   * Best-effort: cache loss is harmless since DB is the source of truth.
   */
  async function updateRedisCache(userId: string, _balance: number): Promise<void> {
    try {
      await invalidateBalanceCache(redis, userId)
    }
    catch {
      logger.withFields({ userId }).warn('Failed to update Redis cache after balance change')
    }
  }

  async function lockWallet(tx: SettlementTransaction, userId: string) {
    const [wallet] = await tx.select().from(fluxSchema.userFlux).where(and(
      eq(fluxSchema.userFlux.userId, userId),
      isNull(fluxSchema.userFlux.deletedAt),
    )).for('update')
    if (!wallet)
      throw new Error(`No active flux record for user ${userId}`)
    return wallet
  }

  /** Integer debits settle the shared pool, independent of the service that crossed its threshold. */
  async function settleOutstanding(
    tx: BillingTransaction,
    wallet: typeof fluxSchema.userFlux.$inferSelect,
    operationId: string,
    usageId?: string,
  ) {
    const requested = Math.floor(wallet.unsettledMicroFlux / MICRO_FLUX_PER_FLUX)
    const charged = Math.min(requested, Math.max(0, wallet.flux))
    const balance = wallet.flux - charged
    const unsettledMicroFlux = wallet.unsettledMicroFlux - charged * MICRO_FLUX_PER_FLUX
    await tx.update(fluxSchema.userFlux).set({ flux: balance, unsettledMicroFlux, updatedAt: new Date() }).where(eq(fluxSchema.userFlux.userId, wallet.userId))
    if (charged > 0) {
      await tx.insert(fluxTxSchema.fluxTransaction).values({
        userId: wallet.userId,
        usageId,
        operationId,
        type: 'debit',
        amount: charged,
        balanceBefore: wallet.flux,
        balanceAfter: balance,
        description: 'usage_settlement',
        metadata: { source: 'usage.settlement', unsettledBefore: wallet.unsettledMicroFlux, unsettledAfter: unsettledMicroFlux },
      })
    }
    return { charged, requested, balance, unsettledMicroFlux }
  }

  async function postUsage(
    tx: SettlementTransaction,
    wallet: typeof fluxSchema.userFlux.$inferSelect,
    usage: typeof fluxUsage.$inferSelect,
    costMicroFlux: number,
  ) {
    parse(pipe(number(), safeInteger(), minValue(0)), costMicroFlux)
    const outstanding = wallet.unsettledMicroFlux + costMicroFlux
    if (!Number.isSafeInteger(outstanding))
      throw new Error('Outstanding Flux is out of range')
    const result = await settleOutstanding(tx, { ...wallet, unsettledMicroFlux: outstanding }, `usage:${usage.id}:post`, usage.id)
    await tx.update(fluxUsage).set({
      costMicroFlux,
      billingStatus: settlementStatus.settled,
      pendingReason: null,
      requestedDebitFlux: result.requested,
      walletDebitFlux: result.charged,
      settledAt: new Date(),
    }).where(eq(fluxUsage.id, usage.id))
    return { ...result, costMicroFlux, pending: false, replay: false }
  }

  function replayUsage(wallet: typeof fluxSchema.userFlux.$inferSelect, usage: typeof fluxUsage.$inferSelect) {
    return {
      charged: usage.walletDebitFlux!,
      requested: usage.requestedDebitFlux!,
      costMicroFlux: usage.costMicroFlux!,
      balance: wallet.flux,
      unsettledMicroFlux: wallet.unsettledMicroFlux,
      pending: false,
      replay: true,
    }
  }

  return {
    /** Saves the authorized price before dispatch, independently of diagnostic logging. */
    async beginLlmRequest(input: { userId: string, requestId: string, model: string, policy: unknown }) {
      const policy = parse(billingPolicySchema, input.policy)
      const userId = parse(pipe(string(), nonEmpty()), input.userId)
      const requestId = parse(pipe(string(), nonEmpty()), input.requestId)
      await db.insert(fluxUsage).values({
        userId,
        service: 'llm',
        requestId,
        model: input.model,
        method: settlementMethod.unresolved,
        billingStatus: settlementStatus.pending,
        pendingReason: 'awaiting_result',
        pricing: policy,
      })
    },

    /** Closes only an unresolved intake after the caller confirms no upstream key was dispatched. */
    async cancelUndispatchedLlmRequest(input: { userId: string, requestId: string }) {
      await db.update(fluxUsage).set({
        billingStatus: settlementStatus.cancelled,
        pendingReason: 'not_dispatched',
        settledAt: new Date(),
      }).where(and(
        eq(fluxUsage.userId, input.userId),
        eq(fluxUsage.requestId, input.requestId),
        eq(fluxUsage.service, 'llm'),
        eq(fluxUsage.method, settlementMethod.unresolved),
        eq(fluxUsage.billingStatus, settlementStatus.pending),
      ))
    },

    /** Confirms a provider fee and posts it once to the shared micro-Flux pool. Missing costs stay pending. */
    async settleLlmCost(input: {
      provider: string
      userId: string
      requestId: string
      model: string
      usage: CostUsage
      pricing: CostPricing
      pendingReason?: string
      observation: RequestObservation
    }) {
      const provider = parse(pipe(string(), nonEmpty()), input.provider)
      const source = parse(picklist(['provider_reported', 'model_price_table']), input.usage.source)
      const observation = parse(generationObservationSchema, {
        ...input.observation,
        ...input.usage,
        userId: input.userId,
        requestId: input.requestId,
        model: input.model,
        fluxConsumed: 0,
      })
      const result = await db.transaction(async (tx) => {
        const wallet = await lockWallet(tx, input.userId)
        const key = and(eq(fluxUsage.userId, input.userId), eq(fluxUsage.service, 'llm'), eq(fluxUsage.requestId, input.requestId))
        const [existing] = await tx.select().from(fluxUsage).where(key)
        if (existing?.billingStatus === settlementStatus.cancelled)
          throw new Error('Cannot settle an undispatched request')
        if (existing?.billingProvider != null && existing.billingProvider !== provider)
          throw new Error('Provider does not match the cost receipt')
        if (existing?.generationId && input.usage.generationId !== existing.generationId)
          throw new Error('Generation ID does not match the cost receipt')
        if (existing?.billingStatus === settlementStatus.settled) {
          if (existing.model !== input.model)
            throw new Error('Model does not match the cost receipt')
          if (existing.precision === 'micro_flux' && priceLlmCost(input.usage, parse(costPricingSchema, existing.pricing)).costMicroFlux !== existing.costMicroFlux)
            throw new Error('LLM replay does not match the original fee')
          return replayUsage(wallet, existing)
        }
        if (existing && !Object.values(settlementMethod).includes(existing.method))
          throw new Error('Billing method does not match the usage')
        let savedPricing: unknown = input.pricing
        if (existing?.method === settlementMethod.providerCost) {
          savedPricing = existing.pricing
        }
        else if (existing?.method === settlementMethod.unresolved) {
          const policy = parse(billingPolicySchema, existing.pricing)
          savedPricing = policy.costPricing[provider]
          if (!savedPricing)
            throw new Error('Provider cost pricing was not authorized for this request')
        }
        const pricing = parse(costPricingSchema, savedPricing)
        const fee = priceLlmCost(input.usage, pricing)
        const receipt = {
          userId: input.userId,
          service: 'llm',
          requestId: input.requestId,
          model: input.model,
          attemptId: observation.attemptId,
          method: settlementMethod.providerCost,
          billingProvider: provider,
          billingStatus: settlementStatus.pending,
          pendingReason: input.pendingReason ?? fee.pendingReason ?? 'awaiting_settlement',
          generationId: input.usage.generationId,
          providerUsage: observation.providerUsage,
          costSource: source,
          costUsd: fee.costUsd?.toString(),
          pricing,
        }
        const [usage] = await tx.insert(fluxUsage).values(receipt).onConflictDoUpdate({
          target: [fluxUsage.userId, fluxUsage.service, fluxUsage.requestId],
          set: receipt,
        }).returning()
        if (input.pendingReason !== undefined || fee.costMicroFlux === undefined)
          return { charged: 0, requested: 0, costMicroFlux: null, balance: wallet.flux, unsettledMicroFlux: wallet.unsettledMicroFlux, pending: true, replay: false }
        return postUsage(tx, wallet, usage!, fee.costMicroFlux)
      }).catch((error) => {
        logger.withError(error).withFields({
          event: 'flux.usage',
          billingStatus: 'failed',
          service: 'llm',
          userId: input.userId,
          requestId: input.requestId,
          generationId: input.usage.generationId,
          provider,
        }).error('Failed to persist LLM usage')
        throw error
      })
      if (!result.pending && !result.replay) {
        await updateRedisCache(input.userId, result.balance)
        if (result.charged < result.requested)
          metrics?.fluxInsufficientBalance.add(1)
      }
      return result
    },

    /** Posts a confirmed fee from a service-owned pricing rule. Replays must preserve identity and cost. */
    async recordUsage(input: ConfirmedUsage) {
      const fee = parse(confirmedUsageSchema, input)
      const result = await db.transaction(async (tx) => {
        const wallet = await lockWallet(tx, fee.userId)
        const key = and(eq(fluxUsage.userId, fee.userId), eq(fluxUsage.service, fee.service), eq(fluxUsage.requestId, fee.requestId))
        const [existing] = await tx.select().from(fluxUsage).where(key)
        if (existing) {
          if (existing.method !== fee.method || existing.model !== fee.model || existing.billingProvider !== (fee.provider ?? null))
            throw new Error('Usage identity does not match the original fee')
          if (existing.billingStatus === settlementStatus.settled) {
            if (existing.costMicroFlux !== fee.costMicroFlux)
              throw new Error('Usage replay does not match the original fee')
            return replayUsage(wallet, existing)
          }
          throw new Error('Confirmed usage cannot overwrite a pending receipt')
        }
        const [usage] = await tx.insert(fluxUsage).values({
          userId: fee.userId,
          service: fee.service,
          requestId: fee.requestId,
          model: fee.model,
          method: fee.method,
          billingProvider: fee.provider,
          turnId: fee.turnId,
          costSource: fee.costSource,
          pricing: fee.pricing,
          billingStatus: settlementStatus.pending,
        }).returning()
        return postUsage(tx, wallet, usage!, fee.costMicroFlux)
      })
      if (!result.replay)
        await updateRedisCache(fee.userId, result.balance)
      return result
    },

    /** Persists the speech price before dispatch so provider or database failures leave a recoverable intake. */
    async beginSpeechUsage(input: { userId: string, requestId: string, model: string, pricing: SpeechPricing, turnId?: string }) {
      const pricing = parse(speechPricingSchema, input.pricing)
      await db.insert(fluxUsage).values({
        userId: input.userId,
        service: 'tts',
        requestId: input.requestId,
        model: input.model,
        turnId: input.turnId,
        method: 'characters',
        billingStatus: settlementStatus.pending,
        pendingReason: 'awaiting_result',
        pricing,
      }).onConflictDoNothing({ target: [fluxUsage.userId, fluxUsage.service, fluxUsage.requestId] })
    },

    /** Posts confirmed speech units using the saved price. Replay never adds the fee twice. */
    async settleSpeechUsage(input: { userId: string, requestId: string, units: number, model: string, provider?: string, turnId?: string }) {
      const result = await db.transaction(async (tx) => {
        const wallet = await lockWallet(tx, input.userId)
        const [usage] = await tx.select().from(fluxUsage).where(and(
          eq(fluxUsage.userId, input.userId),
          eq(fluxUsage.service, 'tts'),
          eq(fluxUsage.requestId, input.requestId),
        ))
        if (!usage || usage.method !== 'characters')
          throw new Error('Speech usage intake is missing')
        if (usage.billingStatus === settlementStatus.settled) {
          const units = parse(pipe(number(), safeInteger(), minValue(0)), input.units)
          if (usage.model !== input.model || usage.billingProvider !== (input.provider ?? null) || parse(object({ characters: pipe(number(), safeInteger(), minValue(0)) }), usage.providerUsage).characters !== units || priceSpeechUsage(units, parse(speechPricingSchema, usage.pricing)) !== usage.costMicroFlux)
            throw new Error('Speech replay does not match the original fee')
          return replayUsage(wallet, usage)
        }
        const costMicroFlux = priceSpeechUsage(input.units, parse(speechPricingSchema, usage.pricing))
        await tx.update(fluxUsage).set({
          model: input.model,
          billingProvider: input.provider,
          turnId: input.turnId,
          providerUsage: { characters: input.units },
          costSource: 'character_price',
        }).where(eq(fluxUsage.id, usage.id))
        return postUsage(tx, wallet, usage, costMicroFlux)
      })
      if (!result.replay)
        await updateRedisCache(input.userId, result.balance)
      return result
    },

    /** Reads authoritative admission state. Cached balances cannot authorize concurrent usage. */
    async getWallet(userId: string) {
      const [wallet] = await db.select().from(fluxSchema.userFlux).where(and(
        eq(fluxSchema.userFlux.userId, userId),
        isNull(fluxSchema.userFlux.deletedAt),
      ))
      if (!wallet)
        throw new Error(`No active flux record for user ${userId}`)
      return wallet
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

        const settled = await settleOutstanding(tx, { ...row!, flux: balanceAfter }, `credit:${insertedTx!.id}:settle`)
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
        await updateRedisCache(input.userId, txResult.balanceAfter)
        metrics?.fluxCredited.add(input.amount, { source: input.source, type: ledgerType })
      }

      logger.withFields({ userId: input.userId, amount: input.amount, balance: txResult.balanceAfter }).log('Credited flux')
      return txResult
    },

    async syncFluxCache(userId: string, balance: number, credited?: { amount: number, source: string }): Promise<void> {
      await updateRedisCache(userId, balance)
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
