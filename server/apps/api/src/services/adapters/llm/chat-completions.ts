import type { GenerationAdapter } from './types'

import { generationProtocols } from '../../../schemas/generation-protocol'

/** Serializes chat-completions requests without interpreting native response bodies. */
export const chatCompletionsAdapter: GenerationAdapter = {
  request: ({ upstream, request, apiKey }) => ({
    url: `${upstream.baseURL.replace(/\/+$/, '')}${generationProtocols['chat-completions'].createPath}`,
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
  supportsWebSearch: () => false,
}
