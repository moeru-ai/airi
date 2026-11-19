import type { ChatReasoningMode, GenerationProvider } from '@proj-airi/provider-inference'
import type { OpenRouterChatModelRuntimeConfig } from 'vieval/plugins/chat-models'

import { getDefinedProvider, getGenerationProvider, withReasoning } from '@proj-airi/provider-inference'

/**
 * Adapts the OpenRouter model that vieval selected to the provider interface of core-agent.
 *
 * It uses the OpenRouter definition of AIRI, so the request carries the same reasoning fields as the product.
 */
export async function generationProviderFrom(config: OpenRouterChatModelRuntimeConfig, reasoning: ChatReasoningMode): Promise<GenerationProvider> {
  const definition = getDefinedProvider('openrouter-ai')
  if (!definition)
    throw new Error('The provider registry has no OpenRouter definition')

  const provider = getGenerationProvider(await definition.createProvider({ apiKey: config.apiKey, baseUrl: config.baseURL || undefined }))
  if (!provider)
    throw new Error('The OpenRouter provider does not support generation')

  return withReasoning(provider, { reasoning })
}
