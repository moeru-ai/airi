import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
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
     * TTS amounts cover one conversation round. Other public fields describe
     * its latest ledger entry. Private ledger fields stay on the server.
     * Aggregation and pagination use one statement snapshot. Pagination counts
     * display records, so one round cannot split across pages.
     */
    async getHistory(userId: string, limit: number, offset: number) {
      // Match JavaScript trim characters so blank historical IDs stay separate.
      const whitespace = '\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'
      const metadata = schema.fluxTransaction.metadata
      const turnId = sql`btrim(${metadata}->>'turnId', ${whitespace})`
      // Valibot counts UTF-16 code units. PostgreSQL counts code points, so each
      // supplementary character must count twice at the same 128-unit boundary.
      const supplementaryCharacters = '[\u{10000}-\u{10FFFF}]'
      const transactions = db.select({
        ...getTableColumns(schema.fluxTransaction),
        // JSON tuples cannot collide with single-entry IDs or delimiter-containing IDs.
        groupKey: sql`CASE WHEN
          ${schema.fluxTransaction.type} = 'debit'
          AND ${schema.fluxTransaction.description} = 'tts_request'
          AND jsonb_typeof(${metadata}->'turnId') = 'string'
          AND char_length(regexp_replace(${turnId}, ${supplementaryCharacters}, '..', 'g')) BETWEEN 1 AND 128
          THEN jsonb_build_array('tts_round', ${turnId})
          ELSE jsonb_build_array('transaction', ${schema.fluxTransaction.id})
        END`.as('group_key'),
      })
        .from(schema.fluxTransaction)
        .where(eq(schema.fluxTransaction.userId, userId))
        .as('history_transactions')

      // Rank within each group before applying the page limit. The newest entry
      // supplies display details, while the window sum includes the full round.
      const history = db.select({
        id: transactions.id,
        type: transactions.type,
        amount: sql`sum(${transactions.amount}) OVER (PARTITION BY ${transactions.groupKey})`.mapWith(Number).as('total_amount'),
        description: transactions.description,
        metadata: transactions.metadata,
        createdAt: transactions.createdAt,
        position: sql`row_number() OVER (
          PARTITION BY ${transactions.groupKey}
          ORDER BY ${transactions.createdAt} DESC, ${transactions.id} DESC
        )`.as('position'),
      })
        .from(transactions)
        .as('history')

      const entries = await db.select({
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
