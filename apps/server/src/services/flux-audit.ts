import type { Database } from '../libs/db'

import { useLogger } from '@guiiai/logg'
import { desc, eq } from 'drizzle-orm'

import * as schema from '../schemas/flux-audit-log'

const logger = useLogger('flux-audit')

export interface AuditEntry {
  userId: string
  type: 'consumption' | 'addition' | 'initial'
  amount: number
  description: string
  metadata?: Record<string, unknown>
}

export function createFluxAuditService(db: Database) {
  return {
    async log(entry: AuditEntry) {
      await db.insert(schema.fluxAuditLog).values(entry)
      logger.withFields({ userId: entry.userId, type: entry.type, amount: entry.amount }).log('Audit entry recorded')
    },

    async logBatch(entries: AuditEntry[]) {
      if (entries.length === 0)
        return
      await db.insert(schema.fluxAuditLog).values(entries)
      logger.withFields({ count: entries.length }).log('Audit batch recorded')
    },

    async getHistory(userId: string, limit: number, offset: number) {
      const records = await db.query.fluxAuditLog.findMany({
        where: eq(schema.fluxAuditLog.userId, userId),
        orderBy: [desc(schema.fluxAuditLog.createdAt)],
        limit: limit + 1, // fetch one extra to determine hasMore
        offset,
      })

      const hasMore = records.length > limit
      if (hasMore)
        records.pop()

      return { records, hasMore }
    },
  }
}

export type FluxAuditService = ReturnType<typeof createFluxAuditService>
