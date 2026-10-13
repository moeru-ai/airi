import type { RateLimitMetrics } from '../../otel'
import type { AgentTraceService } from '../../services/domain/agent-trace'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { rateLimiter } from '../../middlewares/rate-limit'
import { readJsonBody } from '../../services/domain/field-sync/request'
import { createBadRequestError } from '../../utils/error'
import { agentTraceUploadSchema } from './schema'

/** Client IO tracer spans. Each span belongs to the signed-in user, and the API stores no content. */
export function createAgentTraceRoutes(service: AgentTraceService, rateLimitMetrics: RateLimitMetrics | null) {
  return new Hono<HonoEnv>()
    // A client sends one batch every few seconds while a turn runs.
    .post('/', authGuard, rateLimiter({ max: 60, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'agent-traces.ingest' }), async (c) => {
      const upload = safeParse(agentTraceUploadSchema, await readJsonBody(c.req))
      if (!upload.success)
        throw createBadRequestError('Invalid agent trace upload', 'INVALID_REQUEST', upload.issues)
      return c.json(await service.ingest(c.get('user')!.id, upload.output), 202)
    })
}
