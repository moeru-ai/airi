import type { Database } from '../../libs/db'

import * as schema from '../../schemas/llm-request-log'

export interface RequestLogEntry {
  completionTokens?: number
  durationMs: number
  fluxConsumed: number
  model: string
  promptTokens?: number
  status: number
  userId: string
}

export type RequestLogService = ReturnType<typeof createRequestLogService>

export function createRequestLogService(db: Database) {
  return {
    async logRequest(entry: RequestLogEntry) {
      await db.insert(schema.llmRequestLog).values(entry)
    },
  }
}
