import type { Database } from '../libs/db'

import * as schema from '../schemas/request-log'

export interface RequestLogEntry {
  userId: string
  model: string
  status: number
  durationMs: number
  fluxConsumed: number
}

export function createRequestLogService(db: Database) {
  return {
    async logRequest(entry: RequestLogEntry) {
      await db.insert(schema.apiRequestLog).values(entry)
    },
  }
}

export type RequestLogService = ReturnType<typeof createRequestLogService>
