import type { Message } from '@xsai/shared-chat'

import { listModels } from '@xsai/model'
import { streamText } from '@xsai/stream-text'
import { defineStore } from 'pinia'

export const useLLM = defineStore('llm', () => {
  async function stream(apiUrl: string, apiKey: string, model: string, messages: Message[]) {
    return await streamText({
      baseURL: (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) as `${string}/`,
      apiKey,
      model,
      messages,
      streamOptions: {
        usage: true,
      },
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
