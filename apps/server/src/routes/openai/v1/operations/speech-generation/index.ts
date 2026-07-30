import type { GatewayCallback } from '../../gateway'
import type { V1RouteDeps } from '../../types'

import { createOpenAiSpeechService } from '../../../../../services/domain/openai-speech'

export interface SpeechGenerationOperationRequest {
  userId: string
  body: Record<string, unknown>
  sessionId?: string
  abortSignal?: AbortSignal
}

export function speechGeneration(deps: V1RouteDeps): GatewayCallback<'speech.generate'> {
  const speechService = createOpenAiSpeechService({
    configKV: deps.configKV,
    fluxService: deps.fluxService,
    genAi: deps.genAi,
    llmRouter: deps.llmRouter,
    llmTracing: deps.llmTracing,
    providerCatalogService: deps.providerCatalogService,
    productEventService: deps.productEventService,
    requestLogService: deps.requestLogService,
    ttsMeter: deps.ttsMeter,
    voicePackService: deps.voicePackService,
  })

  return context => speechService.handleSpeechRequest(context.input)
}
