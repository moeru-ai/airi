import type { ChatProvider } from '@xsai-ext/shared-providers'
import type { Message } from '@xsai/shared-chat'

import { listModels } from '@xsai/model'
import { streamText } from '@xsai/stream-text'
import { defineStore } from 'pinia'

export const useLLM = defineStore('llm', () => {
  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: {
    headers?: Record<string, string>
  }) {
    const headers = options?.headers

    return await streamText({
      ...chatProvider.chat(model),
      messages,
      headers,
    })
  }

  async function models(apiUrl: string, apiKey: string) {
    if (apiUrl === '') {
      return []
    }

    try {
      return await listModels({
        baseURL: (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) as `${string}/`,
        apiKey,
      })
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`)) {
        return []
      }

      throw err
    }
  }

  return {
    models,
    stream,
  }
})
