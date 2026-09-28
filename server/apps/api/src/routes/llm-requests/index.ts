import type { RequestLogService } from '../../services/domain/request-log'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { maxLength, nonEmpty, parse, pipe, safeParse, string } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { LimitOffsetPaginationQuerySchema } from '../../utils/http-query'

/** Owner-scoped diagnostics omit credentials, raw evidence, and internal sale prices. */
export function createLlmRequestRoutes(service: RequestLogService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/', async (context) => {
      const { limit, offset } = parse(LimitOffsetPaginationQuerySchema, { limit: context.req.query('limit'), offset: context.req.query('offset') })
      const rows = await service.listRequests(context.get('user')!.id, limit + 1, offset)
      return context.json({ records: rows.slice(0, limit).map(request => ({
        requestId: request.requestId,
        model: request.model,
        state: request.state,
        status: request.status,
        durationMs: request.durationMs,
        createdAt: request.createdAt,
      })), hasMore: rows.length > limit })
    })
    .get('/:requestId', async (context) => {
      const requestId = safeParse(pipe(string(), nonEmpty(), maxLength(128)), context.req.param('requestId'))
      if (!requestId.success)
        return context.json({ error: 'INVALID_REQUEST_ID' }, 400)
      const { request, attempts } = await service.getRequest(context.get('user')!.id, requestId.output)
      if (!request)
        return context.json({ error: 'NOT_FOUND' }, 404)
      return context.json({
        request: request
          ? {
              requestId: request.requestId,
              model: request.model,
              requestedModel: request.requestedModel,
              state: request.state,
              status: request.status,
              startedAt: request.startedAt,
              endedAt: request.endedAt,
              durationMs: request.durationMs,
              timeToFirstTokenMs: request.timeToFirstTokenMs,
              promptTokens: request.promptTokens,
              completionTokens: request.completionTokens,
              cachedTokens: request.cachedTokens,
              reasoningTokens: request.reasoningTokens,
            }
          : null,
        attempts: attempts.map(attempt => ({
          id: attempt.id,
          sequence: attempt.sequence,
          gateway: attempt.gateway,
          model: attempt.model,
          upstreamProvider: attempt.upstreamProvider,
          responseModel: attempt.responseModel,
          state: attempt.state,
          status: attempt.status,
          errorCode: attempt.errorCode,
          startedAt: attempt.startedAt,
          endedAt: attempt.endedAt,
        })),
      })
    })
}
