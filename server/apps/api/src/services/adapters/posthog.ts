import type { ProductAnalyticsSink } from './product-analytics'

import { createHash } from 'node:crypto'

import { useLogger } from '@guiiai/logg'
import { PostHog } from 'posthog-node'

const logger = useLogger('posthog')

/** PostHog delivery for product facts, with the client lifecycle. */
export interface PosthogSink extends ProductAnalyticsSink {
  /** Flushes and closes the client. Call on server shutdown. */
  shutdown: () => Promise<void>
}

function posthogEventUuid(event: string, eventId: string): string {
  const digest = createHash('sha256').update(`airi:posthog:${event}:${eventId}`, 'utf8').digest()
  // Set the UUID version (5) and variant bits, so PostHog accepts the value.
  digest[6] = (digest[6] & 0x0F) | 0x50
  digest[8] = (digest[8] & 0x3F) | 0x80
  const hex = digest.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Sends each fact immediately with the stable AIRI user id.
 *
 * A browser distinct id first gets an `$identify` event, so PostHog merges the
 * anonymous checkout visit into the user. Callers still suppress business replays.
 */
export function createPosthogSink(options: { projectKey: string, host: string }): PosthogSink {
  const client = new PostHog(options.projectKey, {
    host: options.host,
    // The signup hook waits for delivery. Keep one attempt of at most five seconds.
    fetchRetryCount: 0,
    requestTimeout: 5000,
  })
  // captureImmediate reports a delivery failure only through this event.
  client.on('error', error => logger.withError(error).warn('PostHog product event delivery failed'))

  return {
    async capture(input) {
      if (input.posthogDistinctId && input.posthogDistinctId !== input.userId) {
        await client.captureImmediate({
          distinctId: input.userId,
          event: '$identify',
          properties: {
            $anon_distinct_id: input.posthogDistinctId,
            ...(input.posthogSessionId && { $session_id: input.posthogSessionId }),
          },
          ...(input.eventId && { uuid: posthogEventUuid('$identify', input.eventId) }),
        })
      }

      await client.captureImmediate({
        distinctId: input.userId,
        event: input.event,
        properties: {
          ...input.properties,
          ...(input.posthogSessionId && { $session_id: input.posthogSessionId }),
        },
        ...(input.eventId && { uuid: posthogEventUuid(input.event, input.eventId) }),
      })
    },
    async shutdown() {
      await client.shutdown()
    },
  }
}
