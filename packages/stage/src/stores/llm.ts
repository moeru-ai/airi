import type { GenerateAudioStream } from '@airi-proj/elevenlabs/types'
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
    openAI.value = new OpenAI({ ...options, dangerouslyAllowBrowser: true })
    openAIProvider.value = createOpenAI(options)
  }

  async function stream(model: string, messages: CoreMessage[]) {
    if (!openAIProvider.value)
      throw new Error('OpenAI not initialized')
    if (openAI.value?.baseURL === '') {
      throw new Error('OpenAI not initialized')
    }

    return await streamText({
      model: openAIProvider.value(model),
      messages,
    })
  }

  async function models() {
    if (!openAI.value)
      throw new Error('OpenAI not initialized')
    if (openAI.value?.baseURL === '') {
      return {
        data: [],
        object: '',
      }
    }

    try {
      return await openAI.value.models.list()
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`)) {
        return {
          data: [],
          object: '',
        }
      }

      throw err
    }
  }

  async function streamSpeech(baseUrl: string, apiKey: string, text: string, options: Omit<Omit<GenerateAudioStream, 'stream'> & { voice: string }, 'text'>) {
    if (!text || !text.trim())
      throw new Error('Text is required')

    return await ofetch(`${baseUrl}/api/v1/llm/voice/elevenlabs`, {
      body: {
        ...options,
        stream: true,
        text,
      },
      method: 'POST',
      cache: 'no-cache',
      responseType: 'arrayBuffer',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
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
