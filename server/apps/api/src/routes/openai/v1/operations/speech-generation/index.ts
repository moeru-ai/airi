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
    genAi: deps.genAi,
    llmRouter: deps.llmRouter,
    llmTracing: deps.llmTracing,
    providerCatalogService: deps.providerCatalogService,
    requestLogService: deps.requestLogService,
    speechBilling: deps.speechBilling,
    voicePackService: deps.voicePackService,
  })

  return context => speechService.handleSpeechRequest(context.input)
}
