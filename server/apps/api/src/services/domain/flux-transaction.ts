import type { FluxHistoryPage } from '@proj-airi/server-shared/types'

import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { nullable, record, safeParse, string, unknown } from 'valibot'

import * as schema from '../../schemas/flux-transaction'

const logger = useLogger('flux-transaction')

const metadataSchema = nullable(record(string(), unknown()))

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

    /**
     * Returns display records through the existing history contract.
     * TTS amounts cover one conversation round. Other fields describe its latest
     * ledger entry, including actual balance snapshots, not synthetic balances.
     * The projection and entry use one statement snapshot. Pagination counts
     * display records, so one round cannot split across pages.
     */
    async getHistory(userId: string, limit: number, offset: number): Promise<FluxHistoryPage> {
      const page = db.select()
        .from(schema.fluxHistoryRow)
        .where(eq(schema.fluxHistoryRow.userId, userId))
        .orderBy(desc(schema.fluxHistoryRow.lastTime), desc(schema.fluxHistoryRow.key))
        .limit(limit + 1)
        .offset(offset)
        .as('flux_history_page')

      const entries = await db.select({
        id: schema.fluxTransaction.id,
        userId: schema.fluxTransaction.userId,
        type: schema.fluxTransaction.type,
        amount: page.totalAmount,
        balanceBefore: schema.fluxTransaction.balanceBefore,
        balanceAfter: schema.fluxTransaction.balanceAfter,
        requestId: schema.fluxTransaction.requestId,
        description: schema.fluxTransaction.description,
        metadata: schema.fluxTransaction.metadata,
        createdAt: schema.fluxTransaction.createdAt,
      })
        .from(page)
        .innerJoin(schema.fluxTransaction, and(
          eq(schema.fluxTransaction.id, page.latestEntryId),
          eq(schema.fluxTransaction.userId, page.userId),
        ))
        .orderBy(desc(page.lastTime), desc(page.key))

      return {
        records: entries.slice(0, limit).map((entry) => {
          const metadata = safeParse(metadataSchema, entry.metadata)
          return {
            ...entry,
            // Invalid historical metadata cannot supply display details.
            metadata: metadata.success ? metadata.output : null,
            createdAt: entry.createdAt.toISOString(),
          }
        }),
        hasMore: entries.length > limit,
      }
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
