import type { Database } from '../../libs/db'

import { utc } from '@date-fns/utc'
import { createBadRequestError } from '@proj-airi/http-error-shared'
import { addDays, formatISO, subDays } from 'date-fns'
import { and, desc, eq, getTableColumns, gte, inArray, lte, sql, sum } from 'drizzle-orm'

import { fluxUsage } from '../../schemas/flux-usage'

import * as schema from '../../schemas/flux-transaction'

const DAILY_USAGE_DAYS = 365

export function createFluxTransactionService(db: Database) {
  return {
    /** Lists confirmed fees independently of pooled wallet debits. */
    async getUsageHistory(userId: string, limit: number, offset: number) {
      const rows = await db.select({
        id: fluxUsage.id,
        sourceType: fluxUsage.sourceType,
        sourceId: fluxUsage.sourceId,
        amountMicroFlux: fluxUsage.amountMicroFlux,
        createdAt: fluxUsage.createdAt,
      })
        .from(fluxUsage)
        .where(eq(fluxUsage.userId, userId))
        .orderBy(desc(fluxUsage.createdAt), desc(fluxUsage.id))
        .limit(limit + 1)
        .offset(offset)
      return { records: rows.slice(0, limit), hasMore: rows.length > limit }
    },

    /** Returns 365 local calendar days, with zero fees on days without usage. */
    async getDailyUsage(userId: string, timeZone: string, now = new Date()) {
      const timeZoneName = sql`name`
      const [zone] = await db.select({
        lastDate: sql<string>`to_char(${now.toISOString()}::timestamptz AT TIME ZONE ${timeZoneName}, 'YYYY-MM-DD')`,
      })
        .from(sql`pg_timezone_names`)
        .where(eq(timeZoneName, timeZone))
      if (!zone)
        throw createBadRequestError('Invalid time zone', 'INVALID_TIME_ZONE')

      const firstDay = subDays(zone.lastDate, DAILY_USAGE_DAYS - 1, { in: utc })
      // Start one UTC day early to include local midnight in zones ahead of UTC.
      const scanStart = subDays(firstDay, 1)

      const localDay = sql<string>`to_char((${fluxUsage.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`.as('local_date')
      const fluxRows = await db.select({
        date: localDay,
        microFlux: sum(fluxUsage.amountMicroFlux).mapWith(Number),
      })
        .from(fluxUsage)
        .where(and(
          eq(fluxUsage.userId, userId),
          inArray(fluxUsage.sourceType, ['llm', 'tts']),
          gte(fluxUsage.createdAt, scanStart),
          lte(fluxUsage.createdAt, now),
        ))
        .groupBy(({ date }) => date)

      const microFluxByDate = new Map(fluxRows.map(row => [row.date, row.microFlux]))
      const days = Array.from({ length: DAILY_USAGE_DAYS }, (_, index) => {
        const date = formatISO(addDays(firstDay, index), { representation: 'date' })
        return {
          date,
          microFlux: microFluxByDate.get(date) ?? 0,
        }
      })

      return { days }
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
