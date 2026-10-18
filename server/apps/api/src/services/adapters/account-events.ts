import type Redis from 'ioredis'
import type { InferInput } from 'valibot'

import type { UserDeletionHandler } from '../domain/user-deletion'

import { useLogger } from '@guiiai/logg'
import { check, date, literal, nonEmpty, object, optional, parse, pipe, regex, strictObject, string, variant } from 'valibot'

const logger = useLogger('account-events').useGlobalConfig()

/**
 * Redis Stream that Cloud (`proj-airi/backend`) reads with the `cloud-inbox` consumer group.
 * The key, the fields, and the version are a cross-repository contract. See
 * `server/docs/ai/adr/2026-10-18-account-events-stream.md`.
 */
const ACCOUNT_EVENTS_STREAM = 'airi:account-events'

/** Approximate trim length. `~` lets Redis trim whole macro nodes, so XADD stays O(1). */
const ACCOUNT_EVENTS_MAX_LENGTH = 100_000

/** Field value that Cloud checks before it reads the other fields. Cloud acks an unknown version without delivery. */
const ACCOUNT_EVENTS_VERSION = '1'

const userIdSchema = pipe(string(), nonEmpty())
const planSchema = pipe(string(), nonEmpty())
/** Cloud stores the subscription event ID as the inbox dedupe key, so a provider retry delivers one message. */
const subscriptionEventIdSchema = pipe(string(), regex(/^(?:stripe|revenuecat):\S+$/))

const accountEventSchema = pipe(
  variant('type', [
    object({
      id: subscriptionEventIdSchema,
      type: literal('subscription.renewed'),
      userId: userIdSchema,
      occurredAt: date(),
      payload: strictObject({ plan: planSchema, periodEnd: date() }),
    }),
    object({
      id: subscriptionEventIdSchema,
      type: literal('subscription.payment_failed'),
      userId: userIdSchema,
      occurredAt: date(),
      payload: strictObject({ plan: planSchema, retryAt: optional(date()) }),
    }),
    object({
      id: string(),
      type: literal('user.deleted'),
      userId: userIdSchema,
      occurredAt: date(),
      payload: strictObject({}),
    }),
  ]),
  // A deletion retry must publish the same ID, so Cloud deletes the inbox one time.
  check(event => event.type !== 'user.deleted' || event.id === `user-deletion:${event.userId}`, 'user.deleted id must be user-deletion:<userId>'),
)

/** One account fact for Cloud. Dates are encoded as RFC 3339 UTC strings when published. */
export type AccountEvent = InferInput<typeof accountEventSchema>

/**
 * Encodes the flat stream fields in XADD argument order.
 * `payload` is a JSON string, because stream field values are flat strings.
 * `JSON.stringify` writes each `Date` as an RFC 3339 UTC string and omits an unset `retryAt`.
 */
function streamFieldsFrom(event: AccountEvent): string[] {
  return [
    'id',
    event.id,
    'type',
    event.type,
    'userId',
    event.userId,
    'occurredAt',
    event.occurredAt.toISOString(),
    'version',
    ACCOUNT_EVENTS_VERSION,
    'payload',
    JSON.stringify(event.payload),
  ]
}

/**
 * Publishes account events to the shared Redis Stream.
 *
 * Producer rule: `publish` rejects when validation or XADD fails. The caller must let the error
 * fail its request, so the provider, Auth, or Admin retries. Never swallow the error.
 * moeru-ai/airi #1792 removed the previous stream because a caller ignored XADD failures.
 * A retry can append the same `id` again. Cloud deduplicates on `id`.
 */
export function createAccountEventPublisher(redis: Redis) {
  return {
    async publish(event: AccountEvent): Promise<string> {
      const fields = streamFieldsFrom(parse(accountEventSchema, event))
      const streamMessageId = await redis.xadd(ACCOUNT_EVENTS_STREAM, 'MAXLEN', '~', ACCOUNT_EVENTS_MAX_LENGTH, '*', ...fields)
      // ioredis types the reply as nullable. Redis returns null only for NOMKSTREAM, which this
      // call does not send. Treat null as a failed publish, not as success.
      if (!streamMessageId)
        throw new Error(`Redis XADD to ${ACCOUNT_EVENTS_STREAM} returned no stream entry ID`)

      logger.withFields({ id: event.id, type: event.type, streamMessageId }).log('Published account event')
      return streamMessageId
    },
  }
}

export type AccountEventPublisher = ReturnType<typeof createAccountEventPublisher>

/**
 * Deletion handler that tells Cloud to delete the user's inbox.
 * Priority 40 runs it after every soft delete. A publish failure aborts the pipeline before
 * Auth hard-deletes the user, so the retried deletion publishes again.
 */
export function createUserDeletedEventHandler(publisher: Pick<AccountEventPublisher, 'publish'>): UserDeletionHandler {
  return {
    name: 'accountEvents',
    priority: 40,
    async softDelete({ userId }) {
      await publisher.publish({
        id: `user-deletion:${userId}`,
        type: 'user.deleted',
        userId,
        occurredAt: new Date(),
        payload: {},
      })
    },
  }
}
