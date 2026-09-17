import type { FluxHistoryEntry, FluxHistoryPage, FluxHistoryRow } from '@proj-airi/server-shared/types'

import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { nullable, record, safeParse, string, unknown } from 'valibot'

import { resolveTtsBillingCorrelation } from './billing/tts-correlation'

import * as schema from '../../schemas/flux-transaction'

const logger = useLogger('flux-transaction')

const fluxHistoryMetadataSchema = nullable(record(string(), unknown()))
const historyGroupEntryLimit = 50

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
     * Pagination counts rendered rows. Group aggregates come from the indexed
     * projection, while each group includes a bounded recent-entry sample.
     */
    async getHistoryRows(userId: string, limit: number, offset: number): Promise<FluxHistoryPage> {
      const pageRows = await db.select()
        .from(schema.fluxHistoryRow)
        .where(eq(schema.fluxHistoryRow.userId, userId))
        .orderBy(desc(schema.fluxHistoryRow.lastTime), desc(schema.fluxHistoryRow.key))
        .limit(limit + 1)
        .offset(offset)

      const hasMore = pageRows.length > limit
      const visibleRows = pageRows.slice(0, limit)
      if (visibleRows.length === 0)
        return { rows: [], hasMore }

      const singleEntryIds = visibleRows
        .filter(row => row.kind === 'single')
        .map(row => row.latestEntryId)
      const singleRecords = singleEntryIds.length === 0
        ? []
        : await db.select({
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
              inArray(schema.fluxTransaction.id, singleEntryIds),
            ))

      const singleEntries = new Map(singleRecords.map(record => [record.id, toHistoryEntry(record)]))
      const groupEntries = new Map<string, FluxHistoryEntry[]>()
      await Promise.all(visibleRows
        .filter(row => row.kind === 'tts_round')
        .map(async (row) => {
          const records = await db.select({
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
              eq(schema.fluxTransaction.historyGroupKey, row.key),
            ))
            .orderBy(desc(schema.fluxTransaction.createdAt), desc(schema.fluxTransaction.id))
            .limit(historyGroupEntryLimit)

          groupEntries.set(row.key, records.map(toHistoryEntry))
        }))

      const rows: FluxHistoryRow[] = []
      for (const row of visibleRows) {
        if (row.kind === 'single') {
          const entry = singleEntries.get(row.latestEntryId)
          if (!entry)
            throw new Error(`Flux history projection references missing entry ${row.latestEntryId}`)

          rows.push({ type: 'single', record: entry })
          continue
        }

        const correlation = resolveTtsBillingCorrelation({
          conversationId: row.conversationId,
          roundId: row.roundId,
        })
        if (!correlation)
          throw new Error(`Flux history projection contains invalid correlation for ${row.key}`)

        const entries = groupEntries.get(row.key)
        if (!entries || entries.length === 0)
          throw new Error(`Flux history projection references an empty group ${row.key}`)

        rows.push({
          type: 'group',
          key: row.key,
          ...correlation,
          description: 'tts_request',
          chargeCount: row.chargeCount,
          totalAmount: row.totalAmount,
          firstTime: row.firstTime.toISOString(),
          lastTime: row.lastTime.toISOString(),
          entriesTruncated: row.chargeCount > entries.length,
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

function toHistoryEntry(record: {
  id: string
  type: string
  amount: number
  description: string
  metadata: unknown
  createdAt: Date
}): FluxHistoryEntry {
  const metadataResult = safeParse(fluxHistoryMetadataSchema, record.metadata)
  return {
    id: record.id,
    type: record.type,
    amount: record.amount,
    description: record.description,
    metadata: metadataResult.success ? metadataResult.output : null,
    createdAt: record.createdAt.toISOString(),
  }
}

export type FluxTransactionService = ReturnType<typeof createFluxTransactionService>
