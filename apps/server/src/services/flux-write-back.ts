import type { Database } from '../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, eq, lte, sql } from 'drizzle-orm'

import * as fluxSchema from '../schemas/flux'
import * as logSchema from '../schemas/llm-request-log'

/**
 * NOTE: Flux balances are deducted in real-time via Redis (DECRBY) in FluxService.consumeFlux().
 * This write-back service only syncs the DB — it does NOT touch Redis.
 * It periodically aggregates unsettled request logs and batch-updates the DB's user_flux table
 * so that the persistent balance stays consistent with the Redis cache.
 */
export function createFluxWriteBack(db: Database) {
  const logger = useLogger('flux-write-back').useGlobalConfig()
  let timer: ReturnType<typeof setInterval> | null = null

  async function flush() {
    const snapshotTime = new Date()

    // 1. Aggregate unsettled logs inserted before (or at) this tick
    const totals = await db
      .select({
        userId: logSchema.llmRequestLog.userId,
        total: sql<number>`SUM(${logSchema.llmRequestLog.fluxConsumed})`.as('total'),
      })
      .from(logSchema.llmRequestLog)
      .where(and(eq(logSchema.llmRequestLog.settled, false), lte(logSchema.llmRequestLog.createdAt, snapshotTime)))
      .groupBy(logSchema.llmRequestLog.userId)

    if (totals.length === 0)
      return

    // 2. Batch update in transaction
    await db.transaction(async (tx) => {
      for (const { userId, total } of totals) {
        await tx.update(fluxSchema.userFlux)
          .set({
            flux: sql`${fluxSchema.userFlux.flux} - ${total}`,
            updatedAt: new Date(),
          })
          .where(eq(fluxSchema.userFlux.userId, userId))
      }

      await tx.update(logSchema.llmRequestLog)
        .set({ settled: true })
        .where(and(eq(logSchema.llmRequestLog.settled, false), lte(logSchema.llmRequestLog.createdAt, snapshotTime)))
    })

    logger.withFields({ userCount: totals.length }).log('Write-back completed')
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
