import type { Database } from '../../libs/db'
import type { Env } from '../../libs/env'
import type { RateLimitMetrics } from '../../otel'
import type { ConfigDefinitions, ConfigKVService } from '../../services/adapters/config-kv'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'
import type { SteamMicroTxnClient } from './client'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { formatPrice } from '../../utils/format-price'
import { createCheckoutOperation } from './operations/checkout'
import { createFinalizeOperation } from './operations/finalize'

/**
 * Creates Steam HTTP routes for Flux purchase.
 *
 * Paths stay on `/api/v1/steam`. Checkout opens the order through CORE,
 * then calls InitTxn. Finalize maps FinalizeTxn onto CORE `settle`.
 */
export function createSteamRoutes(
  payment: PaymentService,
  db: Database,
  client: SteamMicroTxnClient | null,
  configKV: ConfigKVService,
  env: Pick<Env, 'WEB_APP_URL' | 'ADDITIONAL_TRUSTED_ORIGINS'>,
  rateLimitMetrics: RateLimitMetrics | null = null,
) {
  const checkout = createCheckoutOperation(payment, db, client, configKV, env)
  const finalize = createFinalizeOperation(payment, db, client)

  return new Hono<HonoEnv>()
    .get('/packages', async (c) => {
      const packs = await configKV.getOptional('FLUX_PACKS') ?? []
      return c.json(listSteamPackages(packs))
    })
    .post('/checkout', authGuard, rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'steam.checkout' }), async (c) => {
      const body = await c.req.json()
      return c.json(await checkout(c.get('user')!, body, c.req.raw))
    })
    .post('/finalize', authGuard, rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'steam.finalize' }), async (c) => {
      const body = await c.req.json()
      return c.json(await finalize(c.get('user')!, body))
    })
}

function listSteamPackages(packs: ConfigDefinitions['FLUX_PACKS']) {
  const items = []
  for (const pack of packs) {
    const steam = pack.processors?.steam
    if (!steam)
      continue

    items.push({
      packKey: pack.key,
      label: pack.name,
      defaultCurrency: steam.currency,
      currencies: { [steam.currency]: formatPrice(steam.amount, steam.currency) },
      recommended: pack.recommended,
    })
  }
  return items
}
