import type { RevenuecatSubscriptionSync } from '../../services/adapters/revenuecat-subscriptions'
import type { SubscriptionService } from '../../services/domain/subscriptions'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { boolean, object, safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'

const PreferenceBodySchema = object({
  fallbackToFlux: boolean(),
})

/**
 * Subscription status, plan quota usage, and the Flux-fallback preference.
 * Access state mirrors the synced RevenueCat entitlement rows.
 */
export function createSubscriptionRoutes(
  subscriptions: SubscriptionService,
  subscriptionSync: RevenuecatSubscriptionSync | null = null,
) {
  return new Hono<HonoEnv>()
    .get('/status', authGuard, async (c) => {
      const userId = c.get('user')!.id
      // Best-effort lazy reconcile: a failed refresh must not fail the read.
      await subscriptionSync?.reconcile(userId).catch(() => undefined)
      const status = await subscriptions.getStatus(userId)
      return c.json({
        ...status,
        fallbackToFlux: await subscriptions.getFallbackPreference(userId),
      })
    })
    .put('/preference', authGuard, async (c) => {
      const parsed = safeParse(PreferenceBodySchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        throw createBadRequestError('Invalid preference body', 'INVALID_REQUEST', parsed.issues)
      const fallbackToFlux = await subscriptions.setFallbackPreference(c.get('user')!.id, parsed.output.fallbackToFlux)
      return c.json({ fallbackToFlux })
    })
}
