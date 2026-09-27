import type { InferOutput } from 'valibot'

import type { Database } from '../../libs/db'
import type { AttemptObserver } from './llm-router/attempt'

import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { boolean, date, finite, integer, literal, minValue, nonEmpty, number, object, optional, parse, picklist, pipe, string, transform, union, unknown } from 'valibot'

import { llmRequestAttempt } from '../../schemas/llm-request-attempt'
import { llmRequestSettlement } from '../../schemas/llm-request-settlement'
import { nanoid } from '../../utils/id'
import { billingPolicySchema } from './billing/billing'
import { attemptResultSchema, attemptStartSchema } from './llm-router/attempt'

import * as schema from '../../schemas/llm-request-log'

const count = pipe(number(), finite(), integer(), minValue(0))
const identifier = pipe(string(), nonEmpty())
const providerEvidenceSchema = pipe(unknown(), transform((value) => {
  const encoded = JSON.stringify(value, (key: string, field: unknown) => {
    if (/^(?:authorization|api[_-]?key|access[_-]?token|secret|password|messages|prompt|input|output|choices)$/i.test(key))
      return undefined
    return field
  })
  if (encoded === undefined)
    return null
  if (encoded.length > 16_384)
    return { capture: 'omitted', reason: 'size_limit', version: 1 }
  const sanitized: unknown = JSON.parse(encoded)
  return sanitized
}))

/** Observation fields cannot set billing state or replace a price snapshot. */
export const requestLogSchema = object({
  userId: identifier,
  model: string(),
  status: count,
  durationMs: count,
  fluxConsumed: count,
  promptTokens: optional(count),
  completionTokens: optional(count),
  totalTokens: optional(count),
  cachedTokens: optional(count),
  cacheWriteTokens: optional(count),
  reasoningTokens: optional(count),
  requestId: optional(identifier),
  state: optional(picklist(['completed', 'failed', 'cancelled', 'interrupted', 'unknown'])),
  attemptId: optional(identifier),
  interactionId: optional(identifier),
  startedAt: optional(date()),
  dimensions: optional(object({ appSurface: optional(string()) })),
  sessionId: optional(string()),
  protocol: optional(string()),
  stream: optional(boolean()),
  requestedModel: optional(string()),
  gateway: optional(string()),
  upstreamModel: optional(string()),
  upstreamProvider: optional(string()),
  responseModel: optional(string()),
  generationId: optional(string()),
  finishReason: optional(string()),
  nativeFinishReason: optional(string()),
  responseStatus: optional(string()),
  timeToFirstTokenMs: optional(count),
  routing: optional(object({
    triedUpstreams: count,
    triedKeys: count,
    lastStatus: optional(union([count, literal('timeout')])),
  })),
  providerUsage: optional(providerEvidenceSchema),
  providerMetadata: optional(providerEvidenceSchema),
})

/** Absent provider fields mean unknown, including historical rows written before request correlation. */
export type RequestLogEntry = InferOutput<typeof requestLogSchema>

/** Runtime observation accompanying a billing transaction; identity and charged Flux belong to billing. */
export type BillingObservation = Omit<RequestLogEntry, 'userId' | 'model' | 'requestId' | 'fluxConsumed'>

/** Owns diagnostic request and attempt lifecycles; settlement evidence has an independent retention boundary. */
export function createRequestLogService(db: Database) {
  return {
    async beginRequest(entry: RequestLogEntry, pricing: unknown) {
      const observation = parse(requestLogSchema, entry)
      const policy = parse(billingPolicySchema, pricing)
      if (!observation.requestId)
        throw new Error('A tracked request requires a request ID')
      await db.transaction(async (tx) => {
        await tx.insert(schema.llmRequestLog).values({ ...observation, state: 'running', startedAt: observation.startedAt ?? new Date() })
        await tx.insert(llmRequestSettlement).values({
          userId: observation.userId,
          requestId: observation.requestId!,
          model: observation.model,
          method: 'unresolved',
          billingStatus: 'pending',
          pendingReason: 'awaiting_result',
          pricing: policy,
        })
      })
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
      const settlements = await db.select().from(llmRequestSettlement).where(and(eq(llmRequestSettlement.userId, userId), eq(llmRequestSettlement.requestId, requestId)))
      return { request: requests.at(0), attempts, settlement: settlements.at(0) }
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

    async logRequest(entry: RequestLogEntry) {
      const observation = parse(requestLogSchema, entry)
      const table = schema.llmRequestLog
      const state = observation.state ?? (observation.status === 499 ? 'cancelled' : observation.status >= 400 ? 'failed' : 'completed')
      const summary = { ...observation, state, endedAt: new Date() }
      await db.insert(table).values(summary).onConflictDoUpdate({
        target: [table.userId, table.requestId],
        targetWhere: sql`request_id IS NOT NULL`,
        set: {
          ...summary,
          fluxConsumed: sql`coalesce((SELECT flux_consumed FROM llm_request_settlement WHERE user_id = ${observation.userId} AND request_id = ${observation.requestId ?? null} AND billing_status = 'settled'), excluded.flux_consumed)`,
          generationId: sql`coalesce(${table.generationId}, excluded.generation_id)`,
          providerUsage: sql`coalesce(excluded.provider_usage, ${table.providerUsage})`,
        },
      })
      if (observation.attemptId && observation.requestId) {
        await db.update(llmRequestAttempt).set({
          state,
          status: observation.status,
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
