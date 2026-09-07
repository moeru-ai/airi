import type { GenerationCapabilities } from './types'

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

/** Only verified OpenAI model families on the official endpoint enable hosted search. */
export function supportsOpenAIWebSearch(baseURL: string | URL, model: string): boolean {
  if (!supportsOpenAIWebSearchEndpoint(baseURL))
    return false
  return /^(?:gpt-4\.1|gpt-4o|gpt-5(?:\.\d+)?|o3|o4-mini)(?:$|-)/.test(model)
    && !/nano|chat|realtime|audio|search|codex|deep-research/.test(model)
}

/** Provider drafts can contain incomplete URLs. Only the known endpoint advertises hosted search. */
export function supportsOpenAIWebSearchEndpoint(baseURL: string | URL): boolean {
  if (!URL.canParse(baseURL))
    return false
  const endpoint = new URL(baseURL)
  return endpoint.origin === 'https://api.openai.com' && /^\/v1\/?$/.test(endpoint.pathname)
}
