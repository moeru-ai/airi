import type { GenerationAdapter } from './types'

import { openaiChatModels } from 'model-bank/openai'

import { generationProtocols } from '../../../schemas/generation-protocol'

// Catalog IDs describe dispatched models, not gateway aliases.
const searchModels = new Set(openaiChatModels.filter(model => model.abilities?.search).map(model => model.id))

/** Serializes responses requests without interpreting native response bodies. */
export const responsesAdapter: GenerationAdapter = {
  request: ({ upstream, request, apiKey }) => ({
    url: `${upstream.baseURL.replace(/\/+$/, '')}${generationProtocols.responses.createPath}`,
    init: {
      method: 'POST',
      headers: {
        ...request.headers,
        'authorization': upstream.headerTemplate.replace('{KEY}', apiKey),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...request.body, model: upstream.overrideModel ?? request.modelName }),
    },
  }),
  supportsWebSearch(upstream, model) {
    // Only the official endpoint advertises OpenAI-hosted search by default.
    if (!URL.canParse(upstream.baseURL))
      return false
    const endpoint = new URL(upstream.baseURL)
    return endpoint.origin === 'https://api.openai.com'
      && /^\/v1\/?$/.test(endpoint.pathname)
      && searchModels.has(upstream.overrideModel ?? model)
  },
}
