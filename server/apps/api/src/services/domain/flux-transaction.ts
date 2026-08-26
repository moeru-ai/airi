import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, inArray } from 'drizzle-orm'

import * as schema from '../../schemas/flux-transaction'

const logger = useLogger('flux-transaction')

export type FluxTransactionService = ReturnType<typeof createFluxTransactionService>

export interface TransactionEntry {
  amount: number
  balanceAfter: number
  balanceBefore: number
  description: string
  metadata?: Record<string, unknown>
  requestId?: string
  type: 'credit' | 'debit' | 'initial' | 'promo'
  userId: string
}

export function createFluxTransactionService(db: Database) {
  return {
    async getHistory(userId: string, limit: number, offset: number) {
      const records = await db.query.fluxTransaction.findMany({
        limit: limit + 1, // fetch one extra to determine hasMore
        offset,
        orderBy: [desc(schema.fluxTransaction.createdAt)],
        where: eq(schema.fluxTransaction.userId, userId),
      })

      const hasMore = records.length > limit
      if (hasMore)
        records.pop()

      return { hasMore, records }
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

    async log(entry: TransactionEntry) {
      await db.insert(schema.fluxTransaction).values(entry)
      logger.withFields({ amount: entry.amount, type: entry.type, userId: entry.userId }).log('Transaction recorded')
    },

    async logBatch(entries: TransactionEntry[]) {
      if (entries.length === 0)
        return
      await db.insert(schema.fluxTransaction).values(entries)
      logger.withFields({ count: entries.length }).log('Transaction batch recorded')
    },
  }
}
