import type { GenerateAudioStream } from '@airi-proj/elevenlabs/types'
import type { Message } from '@xsai/shared-chat-completion'
import { streamText } from '@xsai/stream-text'
import { ofetch } from 'ofetch'
import { OpenAI } from 'openai'
import { defineStore } from 'pinia'

export const useLLM = defineStore('llm', () => {
  async function stream(apiUrl: string, apiKey: string, model: string, messages: Message[]) {
    return await streamText({
      url: `${apiUrl}/chat/completions`,
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
      return {
        data: [],
        object: '',
      }
    }

    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: apiUrl,
        dangerouslyAllowBrowser: true,
      })

      return await openai.models.list()
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
    models,
    stream,
    streamSpeech,
  }
})
