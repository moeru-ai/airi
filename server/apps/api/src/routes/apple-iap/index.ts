import type { RateLimitMetrics } from '../../otel'
import type { PaymentService } from '../../services/domain/payment'
import type { HonoEnv } from '../../types/hono'
import type { Verifier } from './verifier'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createTransactionOperation } from './operations/transactions'

/**
 * Apple IAP channel routes at `/api/v1/apple-iap`.
 *
 * `POST /transactions` — client posts StoreKit 2 JWS (auth required).
 *
 * Native finish policy (server contract, no iOS code in this PR):
 * - 2xx / 4xx: client finishes the StoreKit transaction.
 * - 5xx: client keeps the transaction unfinished and retries later.
 */
export function createAppleIapRoutes(
  payment: PaymentService,
  verifier: Verifier | null,
  rateLimitMetrics?: RateLimitMetrics | null,
) {
  const submitTransaction = createTransactionOperation(payment, verifier)

  return new Hono<HonoEnv>()
    .post(
      '/transactions',
      authGuard,
      rateLimiter({ max: 10, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'apple-iap.transactions' }),
      async (c) => {
        const user = c.get('user')!
        const body = await c.req.json().catch(() => null)
        return c.json(await submitTransaction(user.id, body))
      },
    )
}
