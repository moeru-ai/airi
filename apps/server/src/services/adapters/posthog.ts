import { useLogger } from '@guiiai/logg'
import { PostHog } from 'posthog-node'

const logger = useLogger('posthog')

/**
 * One product event forwarded to PostHog, keyed by the Better Auth user id
 * so it merges with the browser person identified via `posthog.identify()`.
 */
export interface PosthogCaptureInput {
  distinctId: string
  event: string
  properties: Record<string, unknown>
}

/**
 * Minimal capture boundary the product-events service depends on. Kept as
 * an interface so tests inject a fake instead of mocking the SDK.
 */
export interface PosthogSink {
  capture: (input: PosthogCaptureInput) => Promise<void>
  /** Flush and close the underlying client. Call on server shutdown. */
  shutdown: () => Promise<void>
}

/**
 * PostHog sink for server-side product events.
 *
 * Uses `captureImmediate` (one HTTP roundtrip per event, no background
 * queue) on purpose: the forwarded events are low-frequency business facts
 * (signup, payment, subscription lifecycle) fired from webhook/auth-hook
 * paths where a queued batch could be lost on process exit.
 *
 * Capture failures are logged and swallowed — analytics forwarding must
 * never fail the Stripe webhook or auth flow that triggered it. The
 * Postgres `product_events` row is the source of truth either way.
 */
export function createPosthogSink(options: { projectKey: string, host: string }): PosthogSink {
  const client = new PostHog(options.projectKey, { host: options.host })

  return {
    async capture(input: PosthogCaptureInput): Promise<void> {
      try {
        await client.captureImmediate({
          distinctId: input.distinctId,
          event: input.event,
          properties: input.properties,
        })
      }
      catch (err) {
        logger.withError(err).withFields({ event: input.event }).warn('Failed to forward product event to PostHog')
      }
    },

    async shutdown(): Promise<void> {
      await client.shutdown()
    },
  }
}
