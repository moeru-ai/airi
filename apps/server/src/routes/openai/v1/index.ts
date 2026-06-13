import type { Context } from 'hono'

import type { HonoEnv } from '../../../types/hono'
import type { LlmTracingDeps, V1RouteDeps } from './types'

import { authGuard } from '../../../middlewares/auth'
import { configGuard } from '../../../middlewares/config-guard'
import { createV1Gateway } from './gateway'
import { chatCompletionsRateLimit } from './middlewares'
import { chatCompletions } from './operations/chat-completions'
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
    .useHono('audio', '/speech', configGuard(deps.configKV, ['FLUX_PER_1K_CHARS_TTS'], 'TTS service is not available yet'))

  // OpenAI-compatible surface (mounted at /api/v1/openai). Only routes that
  // mirror an actual OpenAI public endpoint belong here. Audio used to live
  // under this prefix too, but the `/audio/voices` listing endpoint isn't a
  // real OpenAI route and the streaming TTS protocol has nothing to do with
  // OpenAI — keeping them here mislabelled the surface, so audio now mounts
  // at /api/v1/audio (see `audioRoutes` below).
  const openai = gateway.route('openai')
    .use('chat.completions', chatCompletionsRateLimit({ metrics: deps.rateLimitMetrics }))
  const openaiRoutes = openai
    .post('/chat/completions', openai.handler(
      'chat.completions',
      async (c) => {
        const user = c.get('user')!
        const body = await c.req.json() as Record<string, unknown>

        return {
          userId: user.id,
          body,
          sessionId: c.req.header('x-airi-session-id'),
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
          sessionId: c.req.header('x-airi-session-id'),
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
