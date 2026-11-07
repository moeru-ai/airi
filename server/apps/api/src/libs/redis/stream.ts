import type Redis from 'ioredis'
import type { GenericSchema, InferInput } from 'valibot'

import { useLogger } from '@guiiai/logg'
import { date, integer, minValue, nonEmpty, number, parse, pipe, string } from 'valibot'

const logger = useLogger('redis-stream').useGlobalConfig()

const keySchema = pipe(string(), nonEmpty())
const positiveIntegerSchema = pipe(number(), integer(), minValue(1))
const idSchema = pipe(string(), nonEmpty())

/**
 * One event type of a stream.
 * Consumers select a handler by `type` and `version`, so a breaking payload change needs a new version.
 */
export interface StreamEventDefinition<TPayload extends GenericSchema<unknown, Record<string, unknown>> = GenericSchema<unknown, Record<string, unknown>>> {
  /** Payload schema version. It is written as a decimal string. */
  version: number
  /**
   * Valibot schema of the JSON payload object. Producers and consumers validate with the same schema,
   * so it must describe JSON values only. Write a date as an RFC 3339 string, for example `pipe(string(), isoTimestamp())`.
   */
  payload: TPayload
}

/** A Redis Stream and the event types that its producers can publish. */
export interface StreamDefinition<TEvents extends Record<string, StreamEventDefinition>> {
  /** Redis key of the stream. */
  key: string
  /** Approximate entry limit. Each XADD trims with `MAXLEN ~`, so Redis trims whole nodes and XADD stays O(1). */
  maxLength: number
  events: TEvents
}

/** What a producer gives for one entry. The publisher adds `type` and `version` from the definition. */
export interface StreamEventInput<TPayload extends GenericSchema<unknown, Record<string, unknown>>> {
  /** Producer event ID. Consumers deduplicate on it, so a retry must use the same ID. */
  id: string
  payload: InferInput<TPayload>
  /** @default new Date() at publish time */
  occurredAt?: Date
}

/**
 * Defines a typed stream. It checks the key, the limit, and each version when the module loads.
 *
 * @example
 * const orderEvents = defineStream({
 *   key: 'order-events',
 *   maxLength: 10_000,
 *   events: { 'order.paid': { version: 1, payload: object({ orderId: string() }) } },
 * })
 */
export function defineStream<const TEvents extends Record<string, StreamEventDefinition>>(
  definition: StreamDefinition<TEvents>,
): StreamDefinition<TEvents> {
  parse(keySchema, definition.key)
  parse(positiveIntegerSchema, definition.maxLength)
  for (const event of Object.values(definition.events))
    parse(positiveIntegerSchema, event.version)
  return definition
}

/**
 * Creates the producer of one stream.
 *
 * Each entry has the flat string fields `id`, `type`, `version`, `occurredAt` (RFC 3339 UTC),
 * and `payload` (JSON object). The envelope has no domain fields.
 *
 * Producer rule: `publish` rejects when validation or XADD fails, and it never swallows the error.
 * The caller must let the error fail its request, so the caller's client retries the request.
 * moeru-ai/airi #1792 removed an earlier stream because a caller ignored XADD failures.
 * A retry can append the same `id` again. Consumers deduplicate on `id`.
 */
export function createStreamPublisher<TEvents extends Record<string, StreamEventDefinition>>(
  redis: Redis,
  definition: StreamDefinition<TEvents>,
) {
  return {
    /** Appends one entry and returns its stream entry ID. */
    async publish<TType extends keyof TEvents & string>(
      type: TType,
      event: StreamEventInput<TEvents[TType]['payload']>,
    ): Promise<string> {
      // A type outside the definition can only arrive through a cast. Reject it like invalid data.
      const eventDefinition = Object.hasOwn(definition.events, type) ? definition.events[type] : undefined
      if (!eventDefinition)
        throw new TypeError(`Stream ${definition.key} has no event type ${type}`)

      const id = parse(idSchema, event.id)
      const occurredAt = parse(date(), event.occurredAt ?? new Date())
      const payload = parse(eventDefinition.payload, event.payload)

      const streamEntryId = await redis.xadd(
        definition.key,
        'MAXLEN',
        '~',
        definition.maxLength,
        '*',
        'id',
        id,
        'type',
        type,
        'version',
        String(eventDefinition.version),
        'occurredAt',
        occurredAt.toISOString(),
        'payload',
        // `JSON.stringify` omits unset optional fields.
        JSON.stringify(payload),
      )
      // ioredis types the reply as nullable. Redis returns null only for NOMKSTREAM, which this
      // call does not send. Treat null as a failed publish, not as success.
      if (!streamEntryId)
        throw new Error(`Redis XADD to ${definition.key} returned no stream entry ID`)

      logger.withFields({ stream: definition.key, id, type, streamEntryId }).log('Published stream entry')
      return streamEntryId
    },
  }
}

export type StreamPublisher<TEvents extends Record<string, StreamEventDefinition>> = ReturnType<typeof createStreamPublisher<TEvents>>
