import type { Database } from '../../libs/db'
import type { GenerationObservation } from './generation-observation'
import type { AttemptObserver } from './llm-router/attempt'
import type { RequestItem } from './request-items'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { parse } from 'valibot'

import { llmRequestAttempt } from '../../schemas/llm-request-attempt'
import { llmRequestItem } from '../../schemas/llm-request-item'
import { nanoid } from '../../utils/id'
import { generationObservationSchema } from './generation-observation'
import { attemptResultSchema, attemptStartSchema } from './llm-router/attempt'
import { splitInputItems, splitOutputItems } from './request-items'

import * as schema from '../../schemas/llm-request-log'

/** Owns diagnostic request and attempt lifecycles; settlement evidence has an independent retention boundary. */
export function createRequestLogService(db: Database) {
  const logger = useLogger('request-log').useGlobalConfig()

  interface ItemOwner {
    userId: string
    requestId: string
    sessionId: string | null
    interactionId: string | null
    startedAt: Date | null
    createdAt: Date
  }

  /**
   * Replaces the items of one direction of one request.
   *
   * The items are derived, so a failed write is logged and does not fail the request.
   */
  async function writeItems(owner: ItemOwner, direction: 'input' | 'output', items: RequestItem[]) {
    const table = llmRequestItem
    const rows = items.map((item, position) => ({
      ...item,
      userId: owner.userId,
      requestId: owner.requestId,
      sessionId: owner.sessionId,
      interactionId: owner.interactionId,
      direction,
      position,
      createdAt: owner.startedAt ?? owner.createdAt,
    }))
    try {
      await db.transaction(async (tx) => {
        await tx.delete(table).where(and(eq(table.userId, owner.userId), eq(table.requestId, owner.requestId), eq(table.direction, direction)))
        if (rows.length > 0)
          await tx.insert(table).values(rows)
      })
    }
    catch (error) {
      logger.withError(error).withFields({ requestId: owner.requestId, direction }).warn('Failed to write llm_request_item rows')
    }
  }

  const itemOwner = {
    userId: schema.llmRequestLog.userId,
    requestId: schema.llmRequestLog.requestId,
    sessionId: schema.llmRequestLog.sessionId,
    interactionId: schema.llmRequestLog.interactionId,
    startedAt: schema.llmRequestLog.startedAt,
    createdAt: schema.llmRequestLog.createdAt,
  }

  return {
    async beginRequest(entry: GenerationObservation) {
      const observation = parse(generationObservationSchema, entry)
      if (!observation.requestId)
        throw new Error('A tracked request requires a request ID')
      const [row] = await db.insert(schema.llmRequestLog).values({ ...observation, state: 'running', startedAt: observation.startedAt ?? new Date() }).returning(itemOwner)
      if (observation.prompt)
        await writeItems({ ...row, requestId: observation.requestId }, 'input', splitInputItems(observation.prompt))
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
      const table = schema.llmRequestLog
      return db.select({ requestId: table.requestId, model: table.model, state: table.state, status: table.status, durationMs: table.durationMs, createdAt: table.createdAt }).from(table).where(eq(table.userId, userId)).orderBy(desc(table.createdAt), desc(table.id)).limit(Math.min(101, Math.max(1, limit))).offset(offset)
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
      const [row] = await db.insert(table).values(summary).onConflictDoUpdate({
        target: [table.userId, table.requestId],
        targetWhere: sql`request_id IS NOT NULL`,
        set: {
          ...summary,
          generationId: sql`coalesce(${table.generationId}, excluded.generation_id)`,
          providerUsage: sql`coalesce(excluded.provider_usage, ${table.providerUsage})`,
        },
      }).returning(itemOwner)
      if (observation.completion && observation.requestId)
        await writeItems({ ...row, requestId: observation.requestId }, 'output', splitOutputItems(observation.completion))
      if (observation.attemptId && observation.requestId) {
        await db.update(llmRequestAttempt).set({
          state,
          endedAt: new Date(),
          generationId: observation.generationId,
          upstreamProvider: observation.upstreamProvider,
          responseModel: observation.responseModel,
          providerUsage: observation.providerUsage,
          providerMetadata: observation.providerMetadata,
          errorBody: observation.errorBody,
          timeToFirstTokenMs: observation.startedAt && observation.timeToFirstTokenMs != null
            ? sql`greatest(0, round(extract(epoch from (${new Date(observation.startedAt.getTime() + observation.timeToFirstTokenMs).toISOString()}::timestamp - ${llmRequestAttempt.startedAt})) * 1000))::integer`
            : undefined,
        }).where(and(eq(llmRequestAttempt.id, observation.attemptId), eq(llmRequestAttempt.userId, observation.userId), eq(llmRequestAttempt.requestId, observation.requestId)))
      }
    },
  }
}

export type RequestLogService = ReturnType<typeof createRequestLogService>
