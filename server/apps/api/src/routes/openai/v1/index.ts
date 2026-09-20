import type { Context } from 'hono'

import type { HonoEnv } from '../../../types/hono'
import type { LlmTracingDeps, V1RouteDeps } from './types'

import { authGuard } from '../../../middlewares/auth'
import { configGuard } from '../../../middlewares/config-guard'
import { rateLimiter } from '../../../middlewares/rate-limit'
import { generationOperation, generationProtocols } from '../../../schemas/generation-protocol'
import { createBadRequestError } from '../../../utils/error'
import {
  AIRI_CHAT_APP_SURFACE_HEADER,
  AIRI_CHAT_ROUND_ID_HEADER,
  AIRI_CHAT_SESSION_ID_HEADER,
  resolveChatAnalyticsSurface,
} from './analytics'
import { createV1Gateway } from './gateway'
import { chatCompletions } from './operations/chat-completions'
import { responsesCreate } from './operations/responses'
import { parseResponsesRequest } from './operations/responses/request'
import { createSpeechCatalogOperation } from './operations/speech-catalog'
import { speechGeneration } from './operations/speech-generation'
import { defaultLlmTracing } from './types'

export interface CreateV1RoutesDeps extends Omit<V1RouteDeps, 'llmTracing'> {
  llmTracing?: LlmTracingDeps
}

export function createV1Routes(input: CreateV1RoutesDeps) {
  const deps: V1RouteDeps = { ...input, llmTracing: input.llmTracing ?? defaultLlmTracing }
  const gateway = createV1Gateway(deps)
    .useHono('*', '*', authGuard)
    .useHono('openai', '/chat/*', configGuard(deps.configKV, ['FLUX_PER_REQUEST'], 'Service is not available yet'))
    .useHono('openai', '/responses', configGuard(deps.configKV, ['FLUX_PER_REQUEST'], 'Service is not available yet'))
    .useHono('audio', '/speech', configGuard(deps.configKV, ['FLUX_PER_1K_CHARS_TTS'], 'TTS service is not available yet'))

  // OpenAI-compatible surface (mounted at /api/v1/openai). Only routes that
  // mirror an actual OpenAI public endpoint belong here. Audio used to live
  // under this prefix too, but the `/audio/voices` listing endpoint isn't a
  // real OpenAI route and the streaming TTS protocol has nothing to do with
  // OpenAI — keeping them here mislabelled the surface, so audio now mounts
  // at /api/v1/audio (see `audioRoutes` below).

  // Authentication runs before this shared HTTP limiter, so both generation
  // protocols use one user bucket before either route parses its request body.
  const generationLimit = rateLimiter({ max: 60, windowSec: 60, metrics: deps.rateLimitMetrics, routeLabel: 'openai.completions' })
  const openai = gateway
    .useHono('openai', '/chat/*', generationLimit)
    .useHono('openai', '/responses', generationLimit)
    .route('openai')
  const openaiRoutes = openai
    .post(generationProtocols.responses.createPath, openai.handler(
      generationOperation('responses'),
      async (c) => {
        let body: unknown
        try {
          body = await c.req.json()
        }
        catch {
          throw createBadRequestError('Invalid Responses JSON body', 'INVALID_RESPONSES_REQUEST')
        }
        const request = parseResponsesRequest(body)
        return {
          userId: c.get('user')!.id,
          ...request,
          sessionId: c.req.header(AIRI_CHAT_SESSION_ID_HEADER),
          roundId: c.req.header(AIRI_CHAT_ROUND_ID_HEADER),
          appSurface: resolveChatAnalyticsSurface(c.req.header(AIRI_CHAT_APP_SURFACE_HEADER)),
          abortSignal: c.req.raw.signal,
        }
      },
      responsesCreate(deps),
    ))
    .post(generationProtocols['chat-completions'].createPath, openai.handler(
      generationOperation('chat-completions'),
      async (c) => {
        const user = c.get('user')!
        const body = await c.req.json() as Record<string, unknown>

        return {
          userId: user.id,
          body,
          sessionId: c.req.header(AIRI_CHAT_SESSION_ID_HEADER),
          roundId: c.req.header(AIRI_CHAT_ROUND_ID_HEADER),
          appSurface: resolveChatAnalyticsSurface(c.req.header(AIRI_CHAT_APP_SURFACE_HEADER)),
          abortSignal: c.req.raw.signal,
        }
      },
      chatCompletions(deps),
    ))
    .route

  const audio = gateway.route('audio')
  const speechCatalog = createSpeechCatalogOperation(deps)

  // AIRI audio surface (mounted at /api/v1/audio). Lives outside /openai/ so
  // the `/voices`, `/voices/streaming`, and `/models` extensions aren't
  // misread as OpenAI-compatible. `/audio/speech/ws` is registered
  // separately in app.ts because it needs the WebSocket upgrade middleware.
  const audioRoutes = audio
    .post('/speech', audio.handler(
      'speech.generate',
      async (c) => {
        const user = c.get('user')!
        const body = await c.req.json() as Record<string, unknown>

        return {
          userId: user.id,
          body,
          sessionId: c.req.header(AIRI_CHAT_SESSION_ID_HEADER),
          abortSignal: c.req.raw.signal,
        }
      },
      speechGeneration(deps),
    ))
    .get('/voices', (c: Context<HonoEnv>) => speechCatalog.listVoices({
      requestedModel: c.req.query('model'),
    }))
    .get('/voices/streaming', (c: Context<HonoEnv>) => speechCatalog.listStreamingVoices({
      model: c.req.query('model'),
    }))
    .get('/models', () => speechCatalog.listSpeechModels())
    .get('/models/streaming', () => speechCatalog.listStreamingSpeechModels())
    .route

  return { openaiRoutes, audioRoutes }
}
