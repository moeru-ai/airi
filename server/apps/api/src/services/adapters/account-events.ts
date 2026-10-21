import type { StreamPublisher } from '../../libs/redis/stream'
import type { UserDeletionHandler } from '../domain/user-deletion'

import { isoTimestamp, nonEmpty, optional, pipe, strictObject, string } from 'valibot'

import { defineStream } from '../../libs/redis/stream'

const userIdSchema = pipe(string(), nonEmpty())
const planSchema = pipe(string(), nonEmpty())
/** RFC 3339 UTC string. Producers write `Date.prototype.toISOString()`. */
const timestampSchema = pipe(string(), isoTimestamp())

/**
 * Account facts that Cloud (`proj-airi/backend`) turns into user notifications.
 * Cloud reads the stream with the `cloud-inbox` consumer group. The key, the types, and the payloads
 * are a cross-repository contract. See `server/docs/ai/adr/2026-10-18-account-events-stream.md`.
 *
 * Event IDs are the Cloud dedupe keys:
 * - `subscription.*`: `<provider>:<provider event id>`, so a provider retry delivers one notification.
 * - `user.deleted`: `user-deletion:<userId>`, so a deletion retry deletes the inbox one time.
 */
export const accountEventsStream = defineStream({
  key: 'account-events',
  maxLength: 100_000,
  events: {
    'subscription.renewed': {
      version: 1,
      payload: strictObject({ userId: userIdSchema, plan: planSchema, periodEnd: timestampSchema }),
    },
    'subscription.payment_failed': {
      version: 1,
      payload: strictObject({ userId: userIdSchema, plan: planSchema, retryAt: optional(timestampSchema) }),
    },
    'user.deleted': {
      version: 1,
      payload: strictObject({ userId: userIdSchema }),
    },
  },
})

export type AccountEventPublisher = StreamPublisher<typeof accountEventsStream.events>

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
      await publisher.publish('user.deleted', { id: `user-deletion:${userId}`, payload: { userId } })
    },
  }
}
