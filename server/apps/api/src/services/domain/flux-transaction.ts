import type { FluxHistoryEntry, FluxHistoryPage, FluxHistoryRow } from '@proj-airi/server-shared/types'

import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
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
     * One lateral-join statement keeps aggregates and entries on one snapshot
     * without reserving one database connection per group.
     */
    async getHistoryRows(userId: string, limit: number, offset: number): Promise<FluxHistoryPage> {
      const pageRows = db.select()
        .from(schema.fluxHistoryRow)
        .where(eq(schema.fluxHistoryRow.userId, userId))
        .orderBy(desc(schema.fluxHistoryRow.lastTime), desc(schema.fluxHistoryRow.key))
        .limit(limit + 1)
        .offset(offset)
        .as('flux_history_page')

      const entryRows = db.select({
        id: schema.fluxTransaction.id,
        type: schema.fluxTransaction.type,
        amount: schema.fluxTransaction.amount,
        description: schema.fluxTransaction.description,
        metadata: schema.fluxTransaction.metadata,
        createdAt: schema.fluxTransaction.createdAt,
      })
        .from(schema.fluxTransaction)
        .where(and(
          eq(schema.fluxTransaction.userId, pageRows.userId),
          or(
            and(
              eq(pageRows.kind, 'single'),
              eq(schema.fluxTransaction.id, pageRows.latestEntryId),
            ),
            and(
              eq(pageRows.kind, 'tts_round'),
              eq(schema.fluxTransaction.historyGroupKey, pageRows.key),
            ),
          ),
        ))
        .orderBy(desc(schema.fluxTransaction.createdAt), desc(schema.fluxTransaction.id))
        .limit(historyGroupEntryLimit)
        .as('flux_history_entries')

      const records = await db.select({
        pageKey: pageRows.key,
        pageKind: pageRows.kind,
        pageConversationId: pageRows.conversationId,
        pageRoundId: pageRows.roundId,
        pageChargeCount: pageRows.chargeCount,
        pageTotalAmount: pageRows.totalAmount,
        pageFirstTime: pageRows.firstTime,
        pageLastTime: pageRows.lastTime,
        pageLatestEntryId: pageRows.latestEntryId,
        entryId: entryRows.id,
        entryType: entryRows.type,
        entryAmount: entryRows.amount,
        entryDescription: entryRows.description,
        entryMetadata: entryRows.metadata,
        entryCreatedAt: entryRows.createdAt,
      })
        .from(pageRows)
        .leftJoinLateral(entryRows, sql`true`)
        .orderBy(
          desc(pageRows.lastTime),
          desc(pageRows.key),
          desc(entryRows.createdAt),
          desc(entryRows.id),
        )

      const entriesByKey = new Map<string, {
        page: {
          key: string
          kind: string
          conversationId: string | null
          roundId: string | null
          chargeCount: number
          totalAmount: number
          firstTime: Date
          lastTime: Date
          latestEntryId: string
        }
        entries: FluxHistoryEntry[]
      }>()
      for (const record of records) {
        const projected = entriesByKey.get(record.pageKey) ?? {
          page: {
            key: record.pageKey,
            kind: record.pageKind,
            conversationId: record.pageConversationId,
            roundId: record.pageRoundId,
            chargeCount: record.pageChargeCount,
            totalAmount: record.pageTotalAmount,
            firstTime: record.pageFirstTime,
            lastTime: record.pageLastTime,
            latestEntryId: record.pageLatestEntryId,
          },
          entries: [],
        }
        if (record.entryId != null) {
          if (record.entryType == null || record.entryAmount == null || record.entryDescription == null || record.entryCreatedAt == null)
            throw new Error(`Flux history entry ${record.entryId} is incomplete`)

          projected.entries.push(toHistoryEntry({
            id: record.entryId,
            type: record.entryType,
            amount: record.entryAmount,
            description: record.entryDescription,
            metadata: record.entryMetadata,
            createdAt: record.entryCreatedAt,
          }))
        }
        entriesByKey.set(record.pageKey, projected)
      }

      const rows: FluxHistoryRow[] = []
      const projectedRows = [...entriesByKey.values()]
      const hasMore = projectedRows.length > limit
      for (const { page: row, entries } of projectedRows.slice(0, limit)) {
        if (row.kind === 'single') {
          const [entry] = entries
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

        if (entries.length === 0)
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
