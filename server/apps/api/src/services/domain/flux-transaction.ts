import type { FluxHistoryEntry, FluxHistoryPage, FluxHistoryRow } from '@proj-airi/server-shared/types'

import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { nullable, record, safeParse, string, unknown } from 'valibot'

import { resolveTtsBillingCorrelation } from './billing/tts-correlation'

import * as schema from '../../schemas/flux-transaction'

const logger = useLogger('flux-transaction')

const fluxHistoryMetadataSchema = nullable(record(string(), unknown()))

const historyRowKey = sql<string>`CASE
  WHEN ${schema.fluxTransaction.type} = 'debit'
    AND ${schema.fluxTransaction.description} = 'tts_request'
    AND jsonb_typeof(${schema.fluxTransaction.metadata}->'conversationId') = 'string'
    AND jsonb_typeof(${schema.fluxTransaction.metadata}->'roundId') = 'string'
    AND char_length(btrim(${schema.fluxTransaction.metadata}->>'conversationId')) BETWEEN 1 AND 128
    AND char_length(btrim(${schema.fluxTransaction.metadata}->>'roundId')) BETWEEN 1 AND 128
  THEN jsonb_build_array(
    'tts_round',
    btrim(${schema.fluxTransaction.metadata}->>'conversationId'),
    btrim(${schema.fluxTransaction.metadata}->>'roundId')
  )::text
  ELSE jsonb_build_array('transaction', ${schema.fluxTransaction.id})::text
END`

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

    /**
     * Returns the server-owned Flux history read model.
     *
     * Pagination counts rendered rows. A validated TTS conversation and round
     * therefore remains on one page even when it contains several ledger entries.
     */
    async getHistoryRows(userId: string, limit: number, offset: number): Promise<FluxHistoryPage> {
      const pageKeys = await db.select({
        key: historyRowKey,
        lastCreatedAt: max(schema.fluxTransaction.createdAt),
      })
        .from(schema.fluxTransaction)
        .where(eq(schema.fluxTransaction.userId, userId))
        .groupBy(historyRowKey)
        .orderBy(desc(max(schema.fluxTransaction.createdAt)), desc(historyRowKey))
        .limit(limit + 1)
        .offset(offset)

      const hasMore = pageKeys.length > limit
      const visibleKeys = pageKeys.slice(0, limit).map(row => row.key)
      if (visibleKeys.length === 0)
        return { rows: [], hasMore }

      const records = await db.select({
        key: historyRowKey,
        id: schema.fluxTransaction.id,
        type: schema.fluxTransaction.type,
        amount: schema.fluxTransaction.amount,
        description: schema.fluxTransaction.description,
        metadata: schema.fluxTransaction.metadata,
        createdAt: schema.fluxTransaction.createdAt,
      })
        .from(schema.fluxTransaction)
        .where(and(
          eq(schema.fluxTransaction.userId, userId),
          inArray(historyRowKey, visibleKeys),
        ))
        .orderBy(desc(schema.fluxTransaction.createdAt), desc(schema.fluxTransaction.id))

      const entriesByKey = new Map<string, FluxHistoryEntry[]>()
      for (const record of records) {
        const metadataResult = safeParse(fluxHistoryMetadataSchema, record.metadata)
        const entry: FluxHistoryEntry = {
          id: record.id,
          type: record.type,
          amount: record.amount,
          description: record.description,
          metadata: metadataResult.success ? metadataResult.output : null,
          createdAt: record.createdAt.toISOString(),
        }
        const entries = entriesByKey.get(record.key)
        if (entries)
          entries.push(entry)
        else
          entriesByKey.set(record.key, [entry])
      }

      const rows: FluxHistoryRow[] = []
      for (const key of visibleKeys) {
        const entries = entriesByKey.get(key)
        if (!entries || entries.length === 0)
          continue

        const correlation = resolveTtsBillingCorrelation(entries[0].metadata)
        if (!correlation || entries[0].type !== 'debit' || entries[0].description !== 'tts_request') {
          rows.push({ type: 'single', record: entries[0] })
          continue
        }

        rows.push({
          type: 'group',
          key,
          ...correlation,
          description: 'tts_request',
          chargeCount: entries.length,
          totalAmount: entries.reduce((total, entry) => total + entry.amount, 0),
          firstTime: entries[entries.length - 1].createdAt,
          lastTime: entries[0].createdAt,
          entries,
        })
      }

      return { rows, hasMore }
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
