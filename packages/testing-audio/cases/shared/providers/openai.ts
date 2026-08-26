import type { ProviderConfiguration } from '../configurations/provider'

/** Configuration for an OpenAI-compatible Provider selected by one case. */
export interface OpenAIProviderOptions {
  apiKey: string
  baseUrl: string
  model: string
  provider: string
}

/** Configuration for an OpenAI-compatible speech Provider selected by one case. */
export interface OpenAISpeechProviderOptions extends OpenAIProviderOptions {
  voice: string
}

/** Creates an OpenAI-compatible ASR Provider configuration. */
export function openaiAsr(options: OpenAIProviderOptions): ProviderConfiguration {
  return {
    id: options.provider,
    definitionId: options.provider,
    model: options.model,
    config: {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    },
  }
}

/** Creates an OpenAI-compatible LLM Provider configuration. */
export function openaiLlm(options: OpenAIProviderOptions): ProviderConfiguration {
  return {
    id: options.provider,
    definitionId: options.provider,
    model: options.model,
    config: {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    },
  }
}

/** Creates an OpenAI-compatible TTS Provider configuration. */
export function openaiTts(options: OpenAISpeechProviderOptions): { provider: ProviderConfiguration, voice: string } {
  return {
    voice: options.voice,
    provider: {
      id: options.provider,
      definitionId: options.provider,
      model: options.model,
      config: {
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        model: options.model,
        voice: options.voice,
      },
    },
  }
}
