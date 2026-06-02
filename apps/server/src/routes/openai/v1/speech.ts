import type { Context, Handler } from 'hono'

import type { HonoEnv } from '../../../types/hono'
import type { V1RouteDeps } from './types'

import { createOpenAiSpeechService } from '../../../services/domain/openai-speech'

export function createSpeechHandler(deps: V1RouteDeps): Handler<HonoEnv> {
  const speechService = createOpenAiSpeechService({
    configKV: deps.configKV,
    fluxService: deps.fluxService,
    genAi: deps.genAi,
    llmRouter: deps.llmRouter,
    llmTracing: deps.llmTracing,
    requestLogService: deps.requestLogService,
    ttsMeter: deps.ttsMeter,
  })

  return async function handleTTS(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const body = await c.req.json() as Record<string, unknown>

    return speechService.handleSpeechRequest({
      userId: user.id,
      body,
      sessionId: c.req.header('x-airi-session-id'),
      abortSignal: c.req.raw.signal,
    })
  }
}
