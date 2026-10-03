import type { Database } from '../../libs/db'
import type { GenerationObservation } from './generation-observation'
import type { AttemptObserver } from './llm-router/attempt'

import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { parse } from 'valibot'

import { llmRequestAttempt } from '../../schemas/llm-request-attempt'
import { nanoid } from '../../utils/id'
import { generationObservationSchema } from './generation-observation'
import { attemptResultSchema, attemptStartSchema } from './llm-router/attempt'

import * as schema from '../../schemas/llm-request-log'

/** Owns diagnostic request and attempt lifecycles; settlement evidence has an independent retention boundary. */
export function createRequestLogService(db: Database) {
  return {
    async beginRequest(entry: GenerationObservation) {
      const observation = parse(generationObservationSchema, entry)
      if (!observation.requestId)
        throw new Error('A tracked request requires a request ID')
      await db.insert(schema.llmRequestLog).values({ ...observation, state: 'running', startedAt: observation.startedAt ?? new Date() })
    },

    observeAttempts(userId: string, requestId: string): AttemptObserver {
      let sequence = 0
      return {
        async start(input) {
          const attempt = parse(attemptStartSchema, input)
          sequence += 1
          const id = nanoid()
          await db.insert(llmRequestAttempt).values({ ...attempt, id, userId, requestId, sequence, state: 'running', startedAt: new Date() })
          return id
        },
        async finish(id, input) {
          const result = parse(attemptResultSchema, input)
          await db.update(llmRequestAttempt).set({ ...result, endedAt: result.state === 'headers_received' ? null : new Date() }).where(and(eq(llmRequestAttempt.id, id), eq(llmRequestAttempt.userId, userId), eq(llmRequestAttempt.requestId, requestId)))
        },
      }
    },

    async getRequest(userId: string, requestId: string) {
      const requests = await db.select().from(schema.llmRequestLog).where(and(eq(schema.llmRequestLog.userId, userId), eq(schema.llmRequestLog.requestId, requestId)))
      const attempts = await db.select().from(llmRequestAttempt).where(and(eq(llmRequestAttempt.userId, userId), eq(llmRequestAttempt.requestId, requestId))).orderBy(llmRequestAttempt.sequence)
      return { request: requests.at(0), attempts }
    },

    async listRequests(userId: string, limit = 50, offset = 0) {
      return db.select().from(schema.llmRequestLog).where(eq(schema.llmRequestLog.userId, userId)).orderBy(desc(schema.llmRequestLog.createdAt), desc(schema.llmRequestLog.id)).limit(Math.min(101, Math.max(1, limit))).offset(offset)
    },

    async recoverStaleRequests(before: Date) {
      return db.transaction(async (tx) => {
        await tx.update(llmRequestAttempt).set({ state: 'unknown' }).where(and(inArray(llmRequestAttempt.state, ['running', 'headers_received']), lt(llmRequestAttempt.startedAt, before)))
        return tx.update(schema.llmRequestLog).set({ state: 'unknown' }).where(and(eq(schema.llmRequestLog.state, 'running'), lt(schema.llmRequestLog.startedAt, before))).returning({ requestId: schema.llmRequestLog.requestId })
      })
    },

    async logRequest(entry: GenerationObservation) {
      const observation = parse(generationObservationSchema, entry)
      const table = schema.llmRequestLog
      const state = observation.state ?? (observation.status === 499 ? 'cancelled' : observation.status >= 200 && observation.status < 300 ? 'completed' : 'failed')
      const summary = { ...observation, state, endedAt: new Date() }
      await db.insert(table).values(summary).onConflictDoUpdate({
        target: [table.userId, table.requestId],
        targetWhere: sql`request_id IS NOT NULL`,
        set: {
          ...summary,
          generationId: sql`coalesce(${table.generationId}, excluded.generation_id)`,
          providerUsage: sql`coalesce(excluded.provider_usage, ${table.providerUsage})`,
        },
      })
      if (observation.attemptId && observation.requestId) {
        await db.update(llmRequestAttempt).set({
          state,
          endedAt: new Date(),
          generationId: observation.generationId,
          upstreamProvider: observation.upstreamProvider,
          responseModel: observation.responseModel,
          providerUsage: observation.providerUsage,
          providerMetadata: observation.providerMetadata,
          timeToFirstTokenMs: observation.startedAt && observation.timeToFirstTokenMs != null
            ? sql`greatest(0, round(extract(epoch from (${new Date(observation.startedAt.getTime() + observation.timeToFirstTokenMs).toISOString()}::timestamp - ${llmRequestAttempt.startedAt})) * 1000))::integer`
            : undefined,
        }).where(and(eq(llmRequestAttempt.id, observation.attemptId), eq(llmRequestAttempt.userId, observation.userId), eq(llmRequestAttempt.requestId, observation.requestId)))
      }
    },
  }
}

export type RequestLogService = ReturnType<typeof createRequestLogService>
