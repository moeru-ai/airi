import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, getTableColumns, gte, inArray, isNotNull, sql, sum } from 'drizzle-orm'

import { fluxUsage } from '../../schemas/flux-usage'
import { llmRequestLog } from '../../schemas/llm-request-log'

import * as schema from '../../schemas/flux-transaction'

const logger = useLogger('flux-transaction')

const DAILY_USAGE_DAYS = 365
const MILLISECONDS_PER_DAY = 86_400_000

/** Formats an instant as the `YYYY-MM-DD` calendar day in an IANA time zone. */
function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

export interface TransactionEntry {
  userId: string
  type: 'credit' | 'debit' | 'initial' | 'promo'
  amount: number
  balanceBefore: number
  balanceAfter: number
  requestId?: string
  description: string
  metadata?: Record<string, unknown>
}

export function createFluxTransactionService(db: Database) {
  return {
    /** Lists confirmed fees, including zero fees, independently of pooled integer wallet debits. */
    async getUsageHistory(userId: string, limit: number, offset: number) {
      const rows = await db.select({
        id: fluxUsage.id,
        sourceType: fluxUsage.sourceType,
        sourceId: fluxUsage.sourceId,
        amountMicroFlux: fluxUsage.amountMicroFlux,
        createdAt: fluxUsage.createdAt,
      }).from(fluxUsage).where(eq(fluxUsage.userId, userId)).orderBy(desc(fluxUsage.createdAt), desc(fluxUsage.id)).limit(limit + 1).offset(offset)
      return { records: rows.slice(0, limit), hasMore: rows.length > limit }
    },

    /**
     * Sums confirmed LLM and speech fees by local day and counts the sessions that started on each day.
     * Returns every day of the last 365 local days, with zero for a day without usage.
     * Speech requests write no request log row, so only LLM requests start sessions.
     */
    async getDailyUsage(userId: string, timeZone: string, now = new Date()) {
      const lastDate = localDate(now, timeZone)
      const firstDate = shiftDate(lastDate, 1 - DAILY_USAGE_DAYS)
      // A local day starts at most 14 hours before the same UTC day, so one day of margin covers every time zone.
      // The local-date filter below makes the window exact.
      const scanStart = new Date(new Date(`${firstDate}T00:00:00Z`).getTime() - MILLISECONDS_PER_DAY)

      // NOTICE:
      // `created_at` is a `timestamp` without time zone, and Drizzle writes it as UTC.
      // Read it as UTC first, then convert to the caller zone. This needs a database `now()` default in UTC.
      const localDay = sql<string>`to_char((${fluxUsage.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`
      // A subquery keeps the zone bind parameter out of GROUP BY, where PostgreSQL does not match repeated placeholders.
      const usageByRequest = db.select({
        date: localDay.as('local_date'),
        sourceType: fluxUsage.sourceType,
        amountMicroFlux: fluxUsage.amountMicroFlux,
      })
        .from(fluxUsage)
        .where(and(
          eq(fluxUsage.userId, userId),
          inArray(fluxUsage.sourceType, ['llm', 'tts']),
          gte(fluxUsage.createdAt, scanStart),
        ))
        .as('usage_by_request')
      const fluxRows = await db.select({
        date: usageByRequest.date,
        sourceType: usageByRequest.sourceType,
        microFlux: sum(usageByRequest.amountMicroFlux).mapWith(Number),
      })
        .from(usageByRequest)
        .where(gte(usageByRequest.date, firstDate))
        .groupBy(usageByRequest.date, usageByRequest.sourceType)

      // The first request of a session can be older than the window, so the oldest request comes from the full history of the user.
      const firstRequestAt = sql<Date>`min(${llmRequestLog.createdAt})`.mapWith(llmRequestLog.createdAt)
      const lastRequestAt = sql<Date>`max(${llmRequestLog.createdAt})`.mapWith(llmRequestLog.createdAt)
      const sessionRows = await db.select({ firstRequestAt, lastRequestAt })
        .from(llmRequestLog)
        .where(and(eq(llmRequestLog.userId, userId), isNotNull(llmRequestLog.sessionId)))
        .groupBy(llmRequestLog.sessionId)
        .having(sql`min(${llmRequestLog.createdAt}) >= ${scanStart.toISOString()}`)

      const newSessionsByDate = new Map<string, number>()
      let longestSessionMs = 0
      for (const session of sessionRows) {
        const startDate = localDate(session.firstRequestAt, timeZone)
        if (startDate < firstDate)
          continue
        newSessionsByDate.set(startDate, (newSessionsByDate.get(startDate) ?? 0) + 1)
        longestSessionMs = Math.max(longestSessionMs, session.lastRequestAt.getTime() - session.firstRequestAt.getTime())
      }

      const microFluxBySourceAndDate = new Map(fluxRows.map(row => [`${row.sourceType}:${row.date}`, row.microFlux]))
      const days = Array.from({ length: DAILY_USAGE_DAYS }, (_, index) => {
        const date = shiftDate(firstDate, index)
        return {
          date,
          llmMicroFlux: microFluxBySourceAndDate.get(`llm:${date}`) ?? 0,
          ttsMicroFlux: microFluxBySourceAndDate.get(`tts:${date}`) ?? 0,
          newSessionCount: newSessionsByDate.get(date) ?? 0,
        }
      })

      return { days, longestSessionMs }
    },

    async log(entry: TransactionEntry) {
      await db.insert(schema.fluxTransaction).values(entry)
      logger.withFields({ userId: entry.userId, type: entry.type, amount: entry.amount }).log('Transaction recorded')
    },

    async logBatch(entries: TransactionEntry[]) {
      if (entries.length === 0)
        return
      await db.insert(schema.fluxTransaction).values(entries)
      logger.withFields({ count: entries.length }).log('Transaction batch recorded')
    },

    async getHistory(userId: string, limit: number, offset: number) {
      const metadata = schema.fluxTransaction.metadata
      const turnId = sql`${metadata}->>'turnId'`
      const transactions = db.select({
        ...getTableColumns(schema.fluxTransaction),
        groupKey: sql`CASE WHEN
          ${schema.fluxTransaction.type} = 'debit'
          AND ${schema.fluxTransaction.description} = 'tts_request'
          AND jsonb_typeof(${metadata}->'turnId') = 'string'
          THEN jsonb_build_array('tts_round', ${turnId})
          ELSE jsonb_build_array('transaction', ${schema.fluxTransaction.id})
        END`.as('group_key'),
      })
        .from(schema.fluxTransaction)
        // The history lists purchased Flux. Capacitor grants and capacitor debits stay out of it.
        .where(and(eq(schema.fluxTransaction.userId, userId), eq(schema.fluxTransaction.pool, 'wallet')))
        .as('history_transactions')
      const history = db.select({
        id: transactions.id,
        type: transactions.type,
        amount: sql`sum(${transactions.amount}) OVER (PARTITION BY ${transactions.groupKey})`.mapWith(Number).as('amount'),
        description: transactions.description,
        metadata: transactions.metadata,
        createdAt: transactions.createdAt,
        position: sql`row_number() OVER (PARTITION BY ${transactions.groupKey} ORDER BY ${transactions.createdAt} DESC, ${transactions.id} DESC)`.as('position'),
      })
        .from(transactions)
        .as('history')
      const records = await db.select({
        id: history.id,
        type: history.type,
        amount: history.amount,
        description: history.description,
        metadata: history.metadata,
        createdAt: history.createdAt,
      })
        .from(history)
        .where(eq(history.position, 1))
        .orderBy(desc(history.createdAt), desc(history.id))
        .limit(limit + 1)
        .offset(offset)

      return { records: records.slice(0, limit), hasMore: records.length > limit }
    },

    async getStats(userId: string) {
      // Get the purchased-Flux balance right after the most recent credit/initial/promo transaction
      // as the "capacity" for the progress bar. Capacitor grants live in the capacitor pool and are skipped. 'promo' (admin grant) bumps capacity
      // so the user's progress bar reflects the new total they have to spend.
      const [latestCredit] = await db.select({
        balanceAfter: schema.fluxTransaction.balanceAfter,
      })
        .from(schema.fluxTransaction)
        .where(
          and(
            eq(schema.fluxTransaction.userId, userId),
            eq(schema.fluxTransaction.pool, 'wallet'),
            inArray(schema.fluxTransaction.type, ['credit', 'initial', 'promo']),
          ),
        )
        .orderBy(desc(schema.fluxTransaction.createdAt))
        .limit(1)

      return { capacity: latestCredit?.balanceAfter ?? 0 }
    },
  }
}

export type FluxTransactionService = ReturnType<typeof createFluxTransactionService>
