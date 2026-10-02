import type { GenerationAdapter } from './types'

import { openaiChatModels } from 'model-bank/openai'

import { generationProtocols } from '../../../schemas/generation-protocol'

// Catalog IDs describe dispatched models, not gateway aliases.
const searchModels = new Set(openaiChatModels.filter(model => model.abilities?.search).map(model => model.id))

function endpointMatches(baseURL: string, origin: string, path: RegExp): boolean {
  if (!URL.canParse(baseURL))
    return false
  const endpoint = new URL(baseURL)
  return endpoint.origin === origin && path.test(endpoint.pathname)
}

/**
 * Maps the provider-neutral search tool to the OpenRouter Responses wire type.
 *
 * @example
 * mapOpenRouterWebSearch({ tools: [{ type: 'web_search' }] })
 * // => { tools: [{ type: 'openrouter:web_search' }] }
 */
function mapOpenRouterWebSearch(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools))
    return body

  return {
    ...body,
    tools: body.tools.map((tool) => {
      if (typeof tool !== 'object' || tool === null || Array.isArray(tool) || !('type' in tool) || tool.type !== 'web_search')
        return tool
      return { ...tool, type: 'openrouter:web_search' }
    }),
  }
}

/** Serializes responses requests without interpreting native response bodies. */
export const responsesAdapter: GenerationAdapter = {
  request: ({ upstream, request, apiKey }) => {
    // OpenRouter names its Responses server tool differently from OpenAI.
    // https://openrouter.ai/docs/guides/features/server-tools/web-search
    const body = endpointMatches(upstream.baseURL, 'https://openrouter.ai', /^\/api\/v1\/?$/)
      ? mapOpenRouterWebSearch(request.body)
      : request.body
    return {
      url: `${upstream.baseURL.replace(/\/+$/, '')}${generationProtocols.responses.createPath}`,
      init: {
        method: 'POST',
        headers: {
          ...request.headers,
          'authorization': upstream.headerTemplate.replace('{KEY}', apiKey),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ...body, model: upstream.overrideModel ?? request.modelName }),
      },
    }
  },
  supportsWebSearch(upstream, model) {
    if (endpointMatches(upstream.baseURL, 'https://openrouter.ai', /^\/api\/v1\/?$/))
      return true
    return endpointMatches(upstream.baseURL, 'https://api.openai.com', /^\/v1\/?$/)
      && searchModels.has(upstream.overrideModel ?? model)
  },
}
