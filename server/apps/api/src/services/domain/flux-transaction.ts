import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'

import * as schema from '../../schemas/flux-transaction'

const logger = useLogger('flux-transaction')

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
        .where(eq(schema.fluxTransaction.userId, userId))
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
      // Get the balance right after the most recent credit/initial/promo transaction
      // as the "capacity" for the progress bar. 'promo' (admin grant) bumps capacity
      // so the user's progress bar reflects the new total they have to spend.
      const [latestCredit] = await db.select({
        balanceAfter: schema.fluxTransaction.balanceAfter,
      })
        .from(schema.fluxTransaction)
        .where(
          and(
            eq(schema.fluxTransaction.userId, userId),
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
