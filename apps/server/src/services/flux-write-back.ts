import type { Database } from '../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'

import * as fluxSchema from '../schemas/flux'
import * as auditSchema from '../schemas/flux-audit-log'
import * as logSchema from '../schemas/llm-request-log'

/**
 * NOTE: Flux balances are deducted in real-time via Redis (DECRBY) in FluxService.consumeFlux().
 * This write-back service only syncs the DB — it does NOT touch Redis.
 * It periodically aggregates unsettled request logs and batch-updates the DB's user_flux table
 * so that the persistent balance stays consistent with the Redis cache.
 *
 * Multi-instance safe: uses CTE with FOR UPDATE SKIP LOCKED
 * to atomically claim unsettled rows, preventing double-deduction.
 */
export function createFluxWriteBack(db: Database) {
  const logger = useLogger('flux-write-back').useGlobalConfig()
  let timer: ReturnType<typeof setInterval> | null = null

  async function flush() {
    const snapshotTime = new Date()

    await db.transaction(async (tx) => {
      // 1. Atomically claim unsettled logs via CTE with FOR UPDATE SKIP LOCKED.
      //    The CTE locks rows so other instances skip them, then the UPDATE
      //    marks them settled and returns the data — all in one statement.
      const claimedCte = tx.$with('claimed').as(
        tx
          .select({ id: logSchema.llmRequestLog.id })
          .from(logSchema.llmRequestLog)
          .where(and(
            eq(logSchema.llmRequestLog.settled, false),
            lte(logSchema.llmRequestLog.createdAt, snapshotTime),
          ))
          .for('update', { skipLocked: true }),
      )

      const claimed = await tx
        .with(claimedCte)
        .update(logSchema.llmRequestLog)
        .set({ settled: true })
        .where(inArray(logSchema.llmRequestLog.id, tx.select({ id: claimedCte.id }).from(claimedCte)))
        .returning({
          userId: logSchema.llmRequestLog.userId,
          model: logSchema.llmRequestLog.model,
          fluxConsumed: logSchema.llmRequestLog.fluxConsumed,
          promptTokens: logSchema.llmRequestLog.promptTokens,
          completionTokens: logSchema.llmRequestLog.completionTokens,
          createdAt: logSchema.llmRequestLog.createdAt,
        })

      if (claimed.length === 0)
        return

      // 2. Aggregate flux per user in-memory
      const userTotals = new Map<string, number>()
      for (const row of claimed) {
        userTotals.set(row.userId, (userTotals.get(row.userId) ?? 0) + row.fluxConsumed)
      }

      // 3. Deduct flux per user
      for (const [userId, total] of userTotals) {
        await tx.update(fluxSchema.userFlux)
          .set({
            flux: sql`${fluxSchema.userFlux.flux} - ${total}`,
            updatedAt: new Date(),
          })
          .where(eq(fluxSchema.userFlux.userId, userId))
      }

      // 4. Batch-insert audit entries
      const auditEntries = claimed.map(log => ({
        userId: log.userId,
        type: 'consumption' as const,
        amount: -log.fluxConsumed,
        description: log.model,
        metadata: {
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
        },
        createdAt: log.createdAt,
      }))

      await tx.insert(auditSchema.fluxAuditLog).values(auditEntries)

      logger.withFields({ userCount: userTotals.size, logCount: claimed.length }).log('Write-back completed')
    })
  }

  return {
    flush,

    start(intervalMs = 60_000) {
      timer = setInterval(() => {
        flush().catch((err) => {
          logger.withError(err).error('Write-back failed')
        })
      }, intervalMs)
    },

    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

export type FluxWriteBack = ReturnType<typeof createFluxWriteBack>
