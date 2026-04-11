import type { Database } from '../libs/db'

import { useLogger } from '@guiiai/logg'
import { desc, eq, sql } from 'drizzle-orm'

import * as schema from '../schemas/flux-transaction'

const logger = useLogger('flux-transaction')

export interface TransactionEntry {
  userId: string
  type: 'credit' | 'debit' | 'initial'
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
      const records = await db.query.fluxTransaction.findMany({
        where: eq(schema.fluxTransaction.userId, userId),
        orderBy: [desc(schema.fluxTransaction.createdAt)],
        limit: limit + 1, // fetch one extra to determine hasMore
        offset,
      })

      const hasMore = records.length > limit
      if (hasMore)
        records.pop()

      return { records, hasMore }
    },

    async getStats(userId: string) {
      const rows = await db.select({
        type: schema.fluxTransaction.type,
        total: sql<number>`sum(${schema.fluxTransaction.amount})`.mapWith(Number),
      })
        .from(schema.fluxTransaction)
        .where(eq(schema.fluxTransaction.userId, userId))
        .groupBy(schema.fluxTransaction.type)

      let totalReceived = 0
      let totalConsumed = 0

      for (const row of rows) {
        if (row.type === 'credit' || row.type === 'initial') {
          totalReceived += row.total
        }
        else if (row.type === 'debit') {
          totalConsumed += row.total
        }
      }

      return { totalReceived, totalConsumed }
    },
  }
}

export type FluxTransactionService = ReturnType<typeof createFluxTransactionService>
