import type { InferOutput } from 'valibot'

import type { RedisCommandClient } from '../libs/mq'

import {
  literal,
  nonEmpty,
  number,
  object,
  optional,
  parse,
  pipe,
  string,
  unknown,
} from 'valibot'

import { createMqService } from '../libs/mq'
import { DEFAULT_NSFW_IMAGE_EVENTS_STREAM } from '../utils/redis-keys'

const NsfwImageEventTypeSchema = literal('nsfw.image.requested')

const NsfwImageRequestedPayloadSchema = object({
  jobId: pipe(string(), nonEmpty()),
  route: pipe(string(), nonEmpty()),
  metadata: optional(unknown()),
})

const NsfwImageEventEnvelopeSchema = object({
  eventId: pipe(string(), nonEmpty()),
  eventType: NsfwImageEventTypeSchema,
  aggregateId: pipe(string(), nonEmpty()),
  userId: pipe(string(), nonEmpty()),
  characterId: pipe(string(), nonEmpty()),
  occurredAt: pipe(string(), nonEmpty()),
  schemaVersion: number(),
  payload: unknown(),
})

type NsfwImageEventEnvelope = InferOutput<typeof NsfwImageEventEnvelopeSchema>
type NsfwImageRequestedPayload = InferOutput<typeof NsfwImageRequestedPayloadSchema>

export type NsfwImageRequestedEvent = NsfwImageEventEnvelope & {
  eventType: 'nsfw.image.requested'
  payload: NsfwImageRequestedPayload
}

export type NsfwImageEvent = NsfwImageRequestedEvent

export function serializeNsfwImageEvent(event: NsfwImageEvent) {
  return {
    event_id: event.eventId,
    event_type: event.eventType,
    aggregate_id: event.aggregateId,
    user_id: event.userId,
    character_id: event.characterId,
    occurred_at: event.occurredAt,
    schema_version: String(event.schemaVersion),
    payload: JSON.stringify(event.payload),
  }
}

export function parseNsfwImageEvent(fields: Record<string, string | undefined>): NsfwImageEvent {
  const payload = fields.payload
  if (payload == null) {
    throw new TypeError('NSFW image event payload is required')
  }

  const parsedEnvelope = parse(NsfwImageEventEnvelopeSchema, {
    eventId: fields.event_id,
    eventType: fields.event_type,
    aggregateId: fields.aggregate_id,
    userId: fields.user_id,
    characterId: fields.character_id,
    occurredAt: fields.occurred_at,
    schemaVersion: Number(fields.schema_version),
    payload: JSON.parse(payload),
  })

  return {
    ...parsedEnvelope,
    eventType: 'nsfw.image.requested',
    payload: parse(NsfwImageRequestedPayloadSchema, parsedEnvelope.payload),
  }
}

export function createNsfwImageMq(redis: RedisCommandClient, options: { stream?: string, maxLength?: number } = {}) {
  return createMqService<NsfwImageEvent>(redis, {
    stream: options.stream ?? DEFAULT_NSFW_IMAGE_EVENTS_STREAM,
    maxLength: options.maxLength,
    serialize: serializeNsfwImageEvent,
    deserialize: parseNsfwImageEvent,
  })
}

export function createNsfwImageRequestedEvent(input: {
  eventId: string
  userId: string
  characterId: string
  jobId: string
  route: 'normal' | 'nsfw'
  metadata?: unknown
}) {
  return {
    eventId: input.eventId,
    eventType: 'nsfw.image.requested' as const,
    aggregateId: input.jobId,
    userId: input.userId,
    characterId: input.characterId,
    occurredAt: new Date().toISOString(),
    schemaVersion: 1,
    payload: {
      jobId: input.jobId,
      route: input.route,
      metadata: input.metadata,
    },
  }
}
