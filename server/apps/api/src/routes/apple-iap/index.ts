import type { Database } from '../../libs/db'
import type { RateLimitMetrics } from '../../otel'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'
import type { Verifier } from './verifier'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createAccountTokenOperation } from './operations/account-token'
import { createNotificationsOperation } from './operations/notifications'
import { createTransactionsOperation } from './operations/transactions'

/**
 * Creates Apple IAP HTTP routes for Flux purchase.
 *
 * Paths stay on `/api/v1/apple-iap`. Device JWS and Notifications V2 both
 * map onto Payment CORE `settle`.
 *
 * `POST /account-token` — mint or return the stored `appAccountToken` (auth required).
 * `POST /transactions` — client posts StoreKit 2 JWS (auth required).
 * `POST /notifications` — App Store Server Notifications V2 (no auth).
 *
 * Native finish policy:
 * - 2xx / 400: client finishes the StoreKit transaction.
 * - 403 / 5xx: client keeps the transaction unfinished and retries later.
 */
export function createAppleIapRoutes(
  payment: PaymentService,
  db: Database,
  verifier: Verifier | null,
  configKV: ConfigKVService,
  rateLimitMetrics?: RateLimitMetrics | null,
) {
  const accountToken = createAccountTokenOperation(db, verifier)
  const transactions = createTransactionsOperation(payment, db, verifier, configKV)
  const notifications = createNotificationsOperation(payment, db, verifier, configKV)

  return new Hono<HonoEnv>()
    .post(
      '/account-token',
      authGuard,
      rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'apple-iap.account-token' }),
      async (c) => {
        return c.json(await accountToken(c.get('user')!.id))
      },
    )
    .post(
      '/transactions',
      authGuard,
      rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'apple-iap.transactions' }),
      async (c) => {
        const body = await c.req.json().catch(() => null)
        return c.json(await transactions(c.get('user')!.id, body))
      },
    )
    .post(
      '/notifications',
      async (c) => {
        const body = await c.req.json().catch(() => null)
        return c.json(await notifications(body))
      },
    )
}
