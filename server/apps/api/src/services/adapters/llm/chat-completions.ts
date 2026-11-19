import type { GenerationAdapter } from './types'

import { generationProtocols } from '../../../schemas/generation-protocol'
import { upstreamHeaders } from './headers'

/** Serializes chat-completions requests without interpreting native response bodies. */
export const chatCompletionsAdapter: GenerationAdapter = {
  request: ({ upstream, request, apiKey }) => ({
    url: `${upstream.baseURL.replace(/\/+$/, '')}${generationProtocols['chat-completions'].createPath}`,
    init: {
      method: 'POST',
      headers: {
        ...request.headers,
        ...upstreamHeaders(upstream, apiKey),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...request.body, model: upstream.overrideModel ?? request.modelName }),
    },
  }),
  supportsWebSearch: () => false,
}
