import type { ContextTokenCounter } from '@proj-airi/core-agent'
import type { GenerationRequest } from '@proj-airi/provider-inference'

import { createAnthropicTokenCounter, createGeminiTokenCounter, createOpenAiInputTokenCounter } from '@proj-airi/core-agent'

interface ProviderAuth {
  apiKey?: string
  baseURL?: string
  fetch?: typeof fetch
}

function readProviderAuth(request: GenerationRequest): ProviderAuth {
  const config = request.config as ProviderAuth
  return {
    apiKey: typeof config.apiKey === 'string' && config.apiKey.trim() ? config.apiKey : undefined,
    baseURL: typeof config.baseURL === 'string' && config.baseURL.trim() ? config.baseURL : undefined,
    fetch: typeof config.fetch === 'function' ? config.fetch : undefined,
  }
}

/**
 * Selects a provider token counter from the resolved provider.
 * OpenAI-compatible chat endpoints do not receive the OpenAI Responses counter.
 * A missing API key keeps the local estimate.
 */
export function selectContextTokenCounter(input: {
  providerId?: string
  request: GenerationRequest
  model: string
}): ContextTokenCounter | undefined {
  const auth = readProviderAuth(input.request)
  if (!auth.apiKey)
    return undefined
  const fetchImpl = auth.fetch ?? globalThis.fetch
  if (input.providerId === 'anthropic') {
    return createAnthropicTokenCounter({
      fetch: fetchImpl,
      apiKey: auth.apiKey,
      baseURL: auth.baseURL ?? 'https://api.anthropic.com',
      model: input.model,
    })
  }
  if (input.providerId === 'google-generative-ai') {
    return createGeminiTokenCounter({
      fetch: fetchImpl,
      apiKey: auth.apiKey,
      baseURL: auth.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta',
      model: input.model,
    })
  }
  if (input.providerId === 'openai' && input.request.protocol === 'responses') {
    return createOpenAiInputTokenCounter({
      fetch: fetchImpl,
      apiKey: auth.apiKey,
      baseURL: auth.baseURL ?? 'https://api.openai.com/v1',
      model: input.model,
    })
  }
  return undefined
}
