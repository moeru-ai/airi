import type { RateLimitMetrics } from '../../otel'
import type { CallAccessService } from '../../services/domain/realtime-calls'
import type { HonoEnv } from '../../types/hono'

import { createBadRequestError, createServiceUnavailableError } from '@proj-airi/http-error-shared'
import { CallAccessParamsSchema, CallAccessRequestSchema } from '@proj-airi/server-sdk-shared/realtime'
import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'

/**
 * Creates the realtime call routes.
 *
 * `callAccess` is `null` when the deployment has no media server. The route stays mounted and answers 503
 * `REALTIME_CALLS_DISABLED`, so a client can tell "not configured" from "not found".
 */
export function createRealtimeRoutes(callAccess: CallAccessService | null, rateLimitMetrics?: RateLimitMetrics | null) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/calls/:callId/access', rateLimiter({ max: 30, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'realtime.call-access' }), async (c) => {
      if (!callAccess)
        throw createServiceUnavailableError('Realtime calls are not configured', 'REALTIME_CALLS_DISABLED')

      const params = safeParse(CallAccessParamsSchema, c.req.param())
      const body = safeParse(CallAccessRequestSchema, await c.req.json().catch(() => undefined))
      if (!params.success || !body.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', params.issues ?? body.issues)

      const access = await callAccess.grant({
        userId: c.get('user')!.id,
        callId: params.output.callId,
        deviceId: body.output.deviceId,
      })
      return c.json(access, 201)
    })
}
