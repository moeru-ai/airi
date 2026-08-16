import type { RateLimitMetrics } from '../../otel'
import type { PaymentService } from '../../services/domain/payment'
import type { AppleIapVerifier } from '../../services/domain/payment/adapters/apple-verifier'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { createTransactionOperation } from './operations/transactions'

export interface AppleIapRouteDeps {
  payment: PaymentService
  verifier: AppleIapVerifier | null
  rateLimitMetrics?: RateLimitMetrics | null
}

/**
 * Apple IAP channel routes at `/api/v1/apple-iap`.
 *
 * `POST /transactions` — client posts StoreKit 2 JWS (auth required).
 *
 * Native finish policy (server contract, no iOS code in this PR):
 * - 2xx / 4xx: client finishes the StoreKit transaction.
 * - 5xx: client keeps the transaction unfinished and retries later.
 */
export function createAppleIapRoutes(deps: AppleIapRouteDeps) {
  const submitTransaction = createTransactionOperation({
    payment: deps.payment,
    verifier: deps.verifier,
  })

  return new Hono<HonoEnv>()
    .post(
      '/transactions',
      authGuard,
      rateLimiter({ max: 10, windowSec: 60, metrics: deps.rateLimitMetrics, routeLabel: 'apple-iap.transactions' }),
      async (c) => {
        const user = c.get('user')!
        const body = await c.req.json().catch(() => null)
        return c.json(await submitTransaction({ userId: user.id, body }))
      },
    )
}
