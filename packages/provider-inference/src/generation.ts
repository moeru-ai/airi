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

/** Provider drafts can contain incomplete URLs. Only the known endpoint advertises hosted search. */
export function supportsOpenAIWebSearchEndpoint(baseURL: string | URL): boolean {
  if (!URL.canParse(baseURL))
    return false
  const endpoint = new URL(baseURL)
  return endpoint.origin === 'https://api.openai.com' && /^\/v1\/?$/.test(endpoint.pathname)
}
