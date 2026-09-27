import type { InferOutput } from 'valibot'

import { boolean, date, finite, integer, literal, minValue, nonEmpty, number, object, optional, picklist, pipe, string, transform, union, unknown } from 'valibot'

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
export const generationObservationSchema = object({
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
export type GenerationObservation = InferOutput<typeof generationObservationSchema>

/** Runtime request observation before identity and charged Flux are attached. */
export type RequestObservation = Omit<GenerationObservation, 'userId' | 'model' | 'requestId' | 'fluxConsumed'>
