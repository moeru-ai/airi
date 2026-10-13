import type { Database } from '../../libs/db'
import type { GenerationObservation } from './generation-observation'
import type { AttemptObserver } from './llm-router/attempt'
import type { RequestItem } from './request-items'

import { useLogger } from '@guiiai/logg'
import { and, desc, eq, gt, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import { parse, safeParse } from 'valibot'

import { llmRequestAttempt } from '../../schemas/llm-request-attempt'
import { llmRequestItem } from '../../schemas/llm-request-item'
import { nanoid } from '../../utils/id'
import { refreshAgentRunAfterRequest } from './agent-trace/run'
import { generationObservationSchema } from './generation-observation'
import { attemptResultSchema, attemptStartSchema } from './llm-router/attempt'
import { requestContentSchema } from './request-content'
import { requestItemParserVersion, splitInputItems, splitOutputItems } from './request-items'

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
   * Returns false when the write failed.
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
      parserVersion: requestItemParserVersion,
      createdAt: owner.startedAt ?? owner.createdAt,
    }))
    try {
      await db.transaction(async (tx) => {
        await tx.delete(table).where(and(eq(table.userId, owner.userId), eq(table.requestId, owner.requestId), eq(table.direction, direction)))
        if (rows.length > 0)
          await tx.insert(table).values(rows)
      })
      return true
    }
    catch (error) {
      logger.withError(error).withFields({ requestId: owner.requestId, direction }).warn('Failed to write llm_request_item rows')
      return false
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
      await refreshAgentRunAfterRequest(db, row.userId, row.interactionId)
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
      const recovered = await db.transaction(async (tx) => {
        await tx.update(llmRequestAttempt).set({ state: 'unknown' }).where(and(inArray(llmRequestAttempt.state, ['running', 'headers_received']), lt(llmRequestAttempt.startedAt, before)))
        return tx.update(schema.llmRequestLog).set({ state: 'unknown' }).where(and(eq(schema.llmRequestLog.state, 'running'), lt(schema.llmRequestLog.startedAt, before))).returning({ requestId: schema.llmRequestLog.requestId, userId: schema.llmRequestLog.userId, interactionId: schema.llmRequestLog.interactionId })
      })
      // A recovered request no longer keeps its turn running.
      for (const turn of new Map(recovered.map(row => [`${row.userId}:${row.interactionId}`, row])).values())
        await refreshAgentRunAfterRequest(db, turn.userId, turn.interactionId)
      return recovered.map(({ requestId }) => ({ requestId }))
    },

    /**
     * Builds the items of stored request rows, oldest first, for rows written before the item table.
     *
     * Call it again with the returned cursor until `next` is undefined.
     * A row is safe to build more than one time, because each write replaces its items.
     */
    async buildItems(input: { after?: { createdAt: Date, id: string }, limit: number }) {
      const table = schema.llmRequestLog
      const rows = await db.select({ ...itemOwner, id: table.id, prompt: table.prompt, completion: table.completion }).from(table).where(and(
        isNotNull(table.requestId),
        input.after ? or(gt(table.createdAt, input.after.createdAt), and(eq(table.createdAt, input.after.createdAt), gt(table.id, input.after.id))) : undefined,
      )).orderBy(table.createdAt, table.id).limit(input.limit)
      let failed = 0
      for (const row of rows) {
        if (!row.requestId)
          continue
        const owner = { ...row, requestId: row.requestId }
        const prompt = safeParse(requestContentSchema, row.prompt)
        const completion = safeParse(requestContentSchema, row.completion)
        if (prompt.success && !await writeItems(owner, 'input', splitInputItems(prompt.output)))
          failed += 1
        if (completion.success && !await writeItems(owner, 'output', splitOutputItems(completion.output)))
          failed += 1
      }
      const last = rows.at(-1)
      return { rows: rows.length, failed, next: rows.length === input.limit && last ? { createdAt: last.createdAt, id: last.id } : undefined }
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
      await refreshAgentRunAfterRequest(db, row.userId, row.interactionId)
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
