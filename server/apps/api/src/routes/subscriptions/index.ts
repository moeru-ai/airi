import type { RevenuecatStatus } from '../../services/adapters/revenuecat-status'
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
 * Remaining share of one grant, as a whole percent.
 * A zero grant has no share, so the caller hides the percent.
 */
export function allowanceRemainingPercent(grantedCredit: number, remainingCredit: number): number | null {
  if (grantedCredit <= 0)
    return null
  return Math.min(100, Math.round((remainingCredit / grantedCredit) * 100))
}

/**
 * Subscription status and the Flux-fallback preference.
 * Entitlements come from RevenueCat. Allowances expose a percent only.
 * Credit counts stay on the ledger for billing.
 */
export function createSubscriptionRoutes(
  subscriptions: SubscriptionService,
  entitlements: Pick<RevenuecatStatus, 'read'>,
) {
  return new Hono<HonoEnv>()
    .get('/status', authGuard, async (c) => {
      const userId = c.get('user')!.id
      const [live, status, fallbackToFlux] = await Promise.all([
        entitlements.read(userId),
        subscriptions.getStatus(userId),
        subscriptions.getFallbackPreference(userId),
      ])
      return c.json({
        subscriptions: live,
        allowances: status.allowances.map(allowance => ({
          entitlementId: allowance.entitlementId,
          remainingPercent: allowanceRemainingPercent(allowance.grantedCredit, allowance.remainingCredit),
        })),
        fallbackToFlux,
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
