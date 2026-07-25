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
  /**
   * Queue a high-volume analytics event without waiting for a network
   * roundtrip. Use on request hot paths where occasional process-exit loss is
   * preferable to user-visible latency.
   */
  captureQueued?: (input: PosthogCaptureInput) => void
  capture: (input: PosthogCaptureInput) => Promise<void>
  /** Flush and close the underlying client. Call on server shutdown. */
  shutdown: () => Promise<void>
}

/**
 * PostHog sink for server-side product events.
 *
 * Low-frequency conversion facts use `captureImmediate` (one HTTP roundtrip
 * per event) because they terminate money/auth funnels. High-frequency AI
 * generation facts use `captureQueued`, which is buffered by the SDK and
 * flushed on shutdown, so chat completion requests don't wait on PostHog.
 *
 * Capture failures are logged and swallowed — analytics forwarding must
 * never fail the Stripe webhook or auth flow that triggered it. The
 * Postgres `product_events` row is the source of truth either way.
 */
export function createPosthogSink(options: { projectKey: string, host: string }): PosthogSink {
  const client = new PostHog(options.projectKey, { host: options.host })

  return {
    captureQueued(input: PosthogCaptureInput): void {
      try {
        client.capture({
          distinctId: input.distinctId,
          event: input.event,
          properties: input.properties,
        })
      }
      catch (err) {
        logger.withError(err).withFields({ event: input.event }).warn('Failed to enqueue product event to PostHog')
      }
    },

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
