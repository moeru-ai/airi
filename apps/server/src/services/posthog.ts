import type { Env } from '../libs/env'

import { useLogger } from '@guiiai/logg'
import { PostHog } from 'posthog-node'

const logger = useLogger('posthog')

/**
 * Server-side PostHog client. Used to capture authoritative business events
 * the browser cannot see (Stripe webhooks, subscription state changes,
 * admin actions). Pairs with the browser-side PostHog already wired up in
 * `packages/stage-ui/src/stores/analytics/posthog.ts`.
 *
 * Use when:
 * - You're inside a server-side handler (Stripe webhook, admin route) and
 *   need to emit an event that will be analysed in PostHog funnels or
 *   cohorts (e.g. `payment_completed`, `subscription_cancelled`).
 *
 * Expects:
 * - `POSTHOG_API_KEY` env var. When unset (dev/CI) this returns `null` so
 *   callers degrade gracefully with `posthog?.capture(...)`.
 * - `distinctId` must match the browser's `posthog.identify(userId)` — we
 *   use the Better Auth `user.id` for that everywhere. Stripe webhooks
 *   that only have an email use the email as a fallback `distinctId` and
 *   include `userId` in the event properties so PostHog's merge resolves
 *   the person.
 *
 * Returns:
 * - A `PostHog` client configured for low-latency immediate sends, or
 *   `null` when key is unset. Callers must use `captureSafe()` (which
 *   wraps `captureImmediate`) — the regular `capture()` only enqueues
 *   and would let webhook responses race ahead of the HTTP send.
 */
export function createPostHogClient(env: Env): PostHog | null {
  if (!env.POSTHOG_API_KEY) {
    logger.warn('POSTHOG_API_KEY is unset — server-side analytics disabled')
    return null
  }

  // NOTICE:
  // `flushAt: 1` keeps the background-batch threshold low so any stray
  // `posthog.capture()` (non-immediate path) flushes promptly. Real send-
  // path for webhook events goes through `captureImmediate()` in
  // `captureSafe`, which bypasses the queue entirely and resolves only
  // after the HTTP round-trip. We also rely on `shutdown(timeoutMs)` from
  // app.ts to drain any residual queue on SIGTERM.
  return new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  })
}

/**
 * Safe capture wrapper. PostHog must never block or fail a webhook /
 * billing path — any error here is logged and swallowed.
 *
 * Use when:
 * - Inside a server-side handler that has business work to finish even
 *   if PostHog is down. The handler already wrote to Postgres and
 *   updated metrics; PostHog is the optional last step.
 *
 * Expects:
 * - Caller awaits the returned promise. We use `captureImmediate` (not
 *   `capture`) because PostHog Node SDK's regular `capture` only enqueues
 *   — `flushAt: 1` triggers a *background* flush, which means the webhook
 *   handler can return before the event reaches PostHog and SIGTERM may
 *   strand the queued event. `captureImmediate` does the HTTP send inline
 *   and resolves only after the network round-trip.
 */
export async function captureSafe(
  posthog: PostHog | null,
  event: { distinctId: string, event: string, properties?: Record<string, unknown> },
): Promise<void> {
  if (!posthog)
    return

  try {
    await posthog.captureImmediate(event)
  }
  catch (err) {
    logger.withError(err).withFields({ event: event.event, distinctId: event.distinctId }).warn('PostHog captureImmediate failed; swallowing to protect caller')
  }
}
