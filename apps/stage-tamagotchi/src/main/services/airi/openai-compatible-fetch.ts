import type { createContext as createMainEventaContext } from '@moeru/eventa/adapters/electron/main'

import { defineStreamInvokeHandler } from '@moeru/eventa'
import { openAICompatibleFetch } from '@proj-airi/stage-shared'

export function setupOpenAICompatibleFetchBridge(params: {
  context: ReturnType<typeof createMainEventaContext>['context']
}) {
  defineStreamInvokeHandler(params.context, openAICompatibleFetch, async function* (payload, options) {
    const url = new URL(payload.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('OpenAI-compatible fetch only supports http and https URLs.')
    }

    const response = await fetch(url, {
      method: payload.method,
      headers: payload.headers,
      body: payload.body,
      signal: options?.abortController?.signal,
    })

    yield {
      type: 'head' as const,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    }

    if (!response.body)
      return

    const reader = response.body.getReader()
    let completed = false
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          completed = true
          return
        }

        yield { type: 'chunk' as const, chunk: value }
      }
    }
    finally {
      if (!completed) {
        try {
          await reader.cancel()
        }
        catch {}
      }
      reader.releaseLock()
    }
  })
}
