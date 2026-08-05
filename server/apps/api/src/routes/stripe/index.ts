import type Redis from 'ioredis'

import type { Env } from '../../libs/env'
import type { RateLimitMetrics, RevenueMetrics } from '../../otel'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { BillingService } from '../../services/domain/billing/billing-service'
import type { FluxService } from '../../services/domain/flux'
import type { ProductEventService } from '../../services/domain/product-events'
import type { StripeService } from '../../services/domain/stripe'
import type { HonoEnv } from '../../types/hono'

import Stripe from 'stripe'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createBadRequestError, createServiceUnavailableError } from '../../utils/error'
import { resolveCheckoutRedirectBase } from '../../utils/origin'
import { createCheckoutOperation } from './operations/checkout'
import { createWebhookOperation } from './operations/webhook'
import { createStripePriceCatalog, formatPrice } from './price-catalog'

export { formatPrice } from './price-catalog'

/**
 * Creates Stripe HTTP routes for Flux purchase and billing records.
 *
 * Use when:
 * - Mounting `/api/v1/stripe` in the server app.
 * - Wiring Stripe checkout, customer portal, package catalog, and webhooks.
 *
 * Expects:
 * - Auth middleware to populate `c.get('user')` for protected endpoints.
 * - Stripe configuration to be present for checkout, portal, and webhook routes.
 *
 * Returns:
 * - A Hono router scoped to Stripe endpoints.
 */
export function createStripeRoutes(
  fluxService: FluxService,
  stripeService: StripeService,
  billingService: BillingService,
  configKV: ConfigKVService,
  env: Env,
  redis: Redis,
  metrics?: RevenueMetrics | null,
  rateLimitMetrics?: RateLimitMetrics | null,
  productEventService?: ProductEventService,
) {
  const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null
  const priceCatalog = stripe ? createStripePriceCatalog(stripe, redis) : null
  const checkout = createCheckoutOperation({ stripe, priceCatalog, stripeService, configKV, env, metrics, productEventService })
  const webhook = createWebhookOperation({
    stripe,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    fluxService,
    stripeService,
    billingService,
    metrics,
    productEventService,
  })

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const fluxProductId = await configKV.getOptional('STRIPE_FLUX_PRODUCT_ID')
      if (!priceCatalog || !fluxProductId)
        return c.json([])

      const prices = await priceCatalog.getActivePrices(fluxProductId)

      // Build per-currency price map for each package.
      return c.json(prices.map((p) => {
        const currencies: Record<string, string> = {
          [p.currency]: formatPrice(p.unitAmount, p.currency),
        }
        for (const [cur, opt] of Object.entries(p.currencyOptions)) {
          currencies[cur] = formatPrice(opt.unitAmount, cur)
        }

        return {
          stripePriceId: p.id,
          label: `${p.metadata.fluxAmount ?? '?'} Flux`,
          defaultCurrency: p.currency,
          currencies,
          recommended: p.metadata.recommended === 'true',
        }
      }))
    })
    .post('/checkout', authGuard, rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'stripe.checkout' }), async (c) => {
      const body = await c.req.json()
      return c.json(await checkout({
        user: c.get('user')!,
        body,
        request: c.req.raw,
      }))
    })
    .get('/orders', authGuard, async (c) => {
      const user = c.get('user')!
      const sessions = await stripeService.getCheckoutSessionsByUserId(user.id)
      return c.json(sessions)
    })
    .get('/invoices', authGuard, async (c) => {
      const user = c.get('user')!
      const invoices = await stripeService.getInvoicesByUserId(user.id)
      return c.json(invoices)
    })
    .post('/portal', authGuard, async (c) => {
      if (!stripe)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

      const user = c.get('user')!
      const customer = await stripeService.getCustomerByUserId(user.id)
      if (!customer)
        throw createBadRequestError('No billing account found', 'NO_CUSTOMER')

      const portalReturnBase = resolveCheckoutRedirectBase(c.req.raw, env.ADDITIONAL_TRUSTED_ORIGINS, env.WEB_APP_URL)

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customer.stripeCustomerId,
        return_url: `${portalReturnBase}/settings/flux`,
      })

      return c.json({ url: portalSession.url })
    })
    .post('/webhook', async (c) => {
      const signature = c.req.header('stripe-signature') ?? null
      const body = signature ? await c.req.text() : ''
      return c.json(await webhook({ signature, body }))
    })
}
