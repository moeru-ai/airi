import type { CoreMessage } from 'ai'
import { createOpenAI, type OpenAIProvider, type OpenAIProviderSettings } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { ofetch } from 'ofetch'
import { OpenAI } from 'openai'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLLM = defineStore('llm', () => {
  const openAI = ref<OpenAI>()
  const openAIProvider = ref<OpenAIProvider>()

  function setupOpenAI(options: OpenAIProviderSettings) {
    openAI.value = new OpenAI({
      ...options,
      dangerouslyAllowBrowser: true,
    })
    openAIProvider.value = createOpenAI(options)
  }

  async function stream(model: string, messages: CoreMessage[]) {
    if (!openAIProvider.value)
      throw new Error('OpenAI not initialized')

    return await streamText({
      model: openAIProvider.value(model),
      messages,
    })
  }

  async function models() {
    if (!openAI.value)
      throw new Error('OpenAI not initialized')

    return await openAI.value.models.list()
  }

  async function streamSpeech(text: string) {
    if (!text || !text.trim())
      throw new Error('Text is required')

    return await ofetch('/api/v1/llm/voice/text-to-speech', {
      body: {
        text,
      },
      method: 'POST',
      cache: 'no-cache',
      responseType: 'arrayBuffer',
    })
  }

  return {
    setupOpenAI,
    openAI,
    models,
    stream,
    streamSpeech,
  }
})
