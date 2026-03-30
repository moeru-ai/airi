import type { InferOutput } from 'valibot'

import type { RedisCommandClient } from '../../libs/mq'

import {
  literal,
  nonEmpty,
  number,
  object,
  optional,
  parse,
  pipe,
  string,
  union,
  unknown,
} from 'valibot'

import { createMqService } from '../../libs/mq'
import { DEFAULT_BILLING_EVENTS_STREAM } from '../../utils/redis-keys'

const BillingEventTypeSchema = union([
  literal('flux.debited'),
  literal('flux.credited'),
  literal('stripe.checkout.completed'),
  literal('llm.request.completed'),
  literal('llm.request.log'),
])

const BalanceChangePayloadSchema = object({
  amount: number(),
  balanceAfter: optional(number()),
  source: optional(pipe(string(), nonEmpty())),
  description: optional(pipe(string(), nonEmpty())),
  metadata: optional(unknown()),
})

const StripeCheckoutCompletedPayloadSchema = object({
  stripeEventId: pipe(string(), nonEmpty()),
  stripeSessionId: pipe(string(), nonEmpty()),
  amount: number(),
  currency: pipe(string(), nonEmpty()),
})

const LlmRequestCompletedPayloadSchema = object({
  model: pipe(string(), nonEmpty()),
  status: number(),
  fluxConsumed: number(),
  promptTokens: optional(number()),
  completionTokens: optional(number()),
})

const LlmRequestLogPayloadSchema = object({
  model: pipe(string(), nonEmpty()),
  status: number(),
  durationMs: number(),
  fluxConsumed: number(),
  promptTokens: optional(number()),
  completionTokens: optional(number()),
})

const BillingEventEnvelopeSchema = object({
  eventId: pipe(string(), nonEmpty()),
  eventType: BillingEventTypeSchema,
  aggregateId: pipe(string(), nonEmpty()),
  userId: pipe(string(), nonEmpty()),
  requestId: optional(pipe(string(), nonEmpty())),
  occurredAt: pipe(string(), nonEmpty()),
  schemaVersion: number(),
  payload: unknown(),
})

export type BillingEventType = InferOutput<typeof BillingEventTypeSchema>

type BillingEventEnvelope = InferOutput<typeof BillingEventEnvelopeSchema>
type BalanceChangePayload = InferOutput<typeof BalanceChangePayloadSchema>
type StripeCheckoutCompletedPayload = InferOutput<typeof StripeCheckoutCompletedPayloadSchema>
type LlmRequestCompletedPayload = InferOutput<typeof LlmRequestCompletedPayloadSchema>
type LlmRequestLogPayload = InferOutput<typeof LlmRequestLogPayloadSchema>

export type FluxDebitedEvent = BillingEventEnvelope & {
  eventType: 'flux.debited'
  payload: BalanceChangePayload
}

export type FluxCreditedEvent = BillingEventEnvelope & {
  eventType: 'flux.credited'
  payload: BalanceChangePayload
}

export type StripeCheckoutCompletedEvent = BillingEventEnvelope & {
  eventType: 'stripe.checkout.completed'
  payload: StripeCheckoutCompletedPayload
}

export type LlmRequestCompletedEvent = BillingEventEnvelope & {
  eventType: 'llm.request.completed'
  payload: LlmRequestCompletedPayload
}

export type LlmRequestLogEvent = BillingEventEnvelope & {
  eventType: 'llm.request.log'
  payload: LlmRequestLogPayload
}

export type BillingEvent
  = | FluxDebitedEvent
    | FluxCreditedEvent
    | StripeCheckoutCompletedEvent
    | LlmRequestCompletedEvent
    | LlmRequestLogEvent

export interface SerializedBillingEventFields extends Record<string, string | undefined> {
  event_id: string
  event_type: BillingEventType
  aggregate_id: string
  user_id: string
  request_id?: string
  occurred_at: string
  schema_version: string
  payload: string
}

export function serializeBillingEvent(event: BillingEvent): SerializedBillingEventFields {
  return {
    event_id: event.eventId,
    event_type: event.eventType,
    aggregate_id: event.aggregateId,
    user_id: event.userId,
    request_id: event.requestId,
    occurred_at: event.occurredAt,
    schema_version: String(event.schemaVersion),
    payload: JSON.stringify(event.payload),
  }
}

/**
 * Create a Redis Stream MQ service pre-configured for billing events.
 */
export function createBillingMq(redis: RedisCommandClient, options: { stream?: string, maxLength?: number } = {}) {
  return createMqService<BillingEvent>(redis, {
    stream: options.stream ?? DEFAULT_BILLING_EVENTS_STREAM,
    maxLength: options.maxLength,
    serialize: serializeBillingEvent,
    deserialize: parseBillingEvent,
  })
}

export function parseBillingEvent(fields: Record<string, string | undefined>): BillingEvent {
  const payload = fields.payload
  if (payload == null) {
    throw new TypeError('Billing event payload is required')
  }

  const parsedEnvelope = parse(BillingEventEnvelopeSchema, {
    eventId: fields.event_id,
    eventType: fields.event_type,
    aggregateId: fields.aggregate_id,
    userId: fields.user_id,
    requestId: fields.request_id,
    occurredAt: fields.occurred_at,
    schemaVersion: Number(fields.schema_version),
    payload: JSON.parse(payload),
  })

  switch (parsedEnvelope.eventType) {
    case 'flux.debited':
      return {
        ...parsedEnvelope,
        eventType: 'flux.debited',
        payload: parse(BalanceChangePayloadSchema, parsedEnvelope.payload),
      }
    case 'flux.credited':
      return {
        ...parsedEnvelope,
        eventType: 'flux.credited',
        payload: parse(BalanceChangePayloadSchema, parsedEnvelope.payload),
      }
    case 'stripe.checkout.completed':
      return {
        ...parsedEnvelope,
        eventType: 'stripe.checkout.completed',
        payload: parse(StripeCheckoutCompletedPayloadSchema, parsedEnvelope.payload),
      }
    case 'llm.request.completed':
      return {
        ...parsedEnvelope,
        eventType: 'llm.request.completed',
        payload: parse(LlmRequestCompletedPayloadSchema, parsedEnvelope.payload),
      }
    case 'llm.request.log':
      return {
        ...parsedEnvelope,
        eventType: 'llm.request.log',
        payload: parse(LlmRequestLogPayloadSchema, parsedEnvelope.payload),
      }
  }
}
