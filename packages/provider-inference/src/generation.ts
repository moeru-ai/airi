import type { GenerationCapabilities, GenerationRequest } from './types'

interface GenerationProtocolDefinition {
  /** The protocol name shown in provider settings. */
  label: string
}

/** Metadata for every wire protocol that AIRI can use for text generation. */
export const generationProtocolDefinitions = {
  'chat-completions': { label: 'Chat Completions' },
  'responses': { label: 'Responses API' },
} as const satisfies Record<GenerationRequest['protocol'], GenerationProtocolDefinition>

/** Builds selector options in the order declared by a provider capability. */
export function generationProtocolOptions(capabilities: GenerationCapabilities) {
  return capabilities.supportedProtocols.map(protocol => ({
    label: generationProtocolDefinitions[protocol].label,
    value: protocol,
  }))
}

/** The protocol list is shared by runtime defaults and the provider editor. */
export const openAIProtocols = {
  supportedProtocols: ['responses', 'chat-completions'],
  defaultProtocol: 'responses',
  nativeTools: { responses: ['web-search'] },
} as const satisfies GenerationCapabilities

export const compatibleProtocols = {
  supportedProtocols: ['chat-completions', 'responses'],
  defaultProtocol: 'chat-completions',
} as const satisfies GenerationCapabilities

/**
 * Whether a Responses endpoint accepts `input_audio` parts in user messages.
 *
 * OpenRouter documents audio input for `/api/v1/responses`, in `wav` and `mp3`. The OpenAI Responses API rejects
 * audio, so other endpoints get the transcript of a voice message instead.
 * https://openrouter.ai/docs/guides/overview/multimodal/audio
 */
export function supportsResponsesAudioInputEndpoint(baseURL: string | URL): boolean {
  try {
    const endpoint = new URL(baseURL)
    return endpoint.origin === 'https://openrouter.ai' && /^\/api\/v1\/?$/.test(endpoint.pathname)
  }
  catch {
    return false
  }
}

/** Provider drafts can contain incomplete URLs. Only the known endpoint advertises hosted search. */
export function supportsOpenAIWebSearchEndpoint(baseURL: string | URL): boolean {
  try {
    const endpoint = new URL(baseURL)
    return endpoint.origin === 'https://api.openai.com' && /^\/v1\/?$/.test(endpoint.pathname)
  }
  catch {
    return false
  }
}
