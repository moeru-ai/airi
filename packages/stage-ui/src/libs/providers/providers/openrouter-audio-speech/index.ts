import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { z } from 'zod'

import { OPENROUTER_ATTRIBUTION_HEADERS } from '../openrouter-ai'
import { defineProvider } from '../registry'

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1/'
const DEFAULT_MODEL = 'openai/gpt-audio-mini'

const openRouterAudioConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
})

type OpenRouterAudioConfig = z.input<typeof openRouterAudioConfigSchema>

const openAIVoices = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const

async function collectAudioChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let buffer = ''
  let done = false

  while (!done) {
    const result = await reader.read()
    if (result.done)
      break

    buffer += decoder.decode(result.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: '))
        continue

      const data = line.slice('data: '.length).trim()
      if (data === '[DONE]') {
        done = true
        break
      }

      try {
        const event = JSON.parse(data) as {
          choices?: Array<{ delta?: { audio?: { data?: string } } }>
        }
        const audio = event.choices?.[0]?.delta?.audio?.data
        if (audio)
          chunks.push(audio)
      }
      catch (error) {
        console.warn('Skipping malformed SSE chunk from OpenRouter audio stream:', data, error)
      }
    }
  }

  return chunks
}

function createAudioFetch(apiKey: string, baseUrl: string, model: string) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (!init?.body || typeof init.body !== 'string')
      throw new Error('Invalid request body')

    const body = JSON.parse(init.body) as { input?: string, voice?: string }
    const response = await globalThis.fetch(new URL('chat/completions', baseUrl), {
      body: JSON.stringify({
        audio: { format: 'pcm16', voice: body.voice },
        messages: [{ content: ttsPrompt(body.input ?? ''), role: 'user' }],
        modalities: ['text', 'audio'],
        model,
        stream: true,
      }),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...OPENROUTER_ATTRIBUTION_HEADERS,
      },
      method: 'POST',
    })
    if (!response.ok)
      throw new Error(`OpenRouter audio request failed: ${response.status} ${await response.text()}`)
    if (!response.body)
      throw new Error('OpenRouter audio response has no body')

    const wav = toWavFromPCM16(decodeBase64Pcm(await collectAudioChunks(response.body)), 24000)
    return new Response(new Blob([wav], { type: 'audio/wav' }), {
      headers: { 'Content-Type': 'audio/wav' },
      status: 200,
    })
  }
}

function decodeBase64Pcm(chunks: string[]) {
  const binary = atob(chunks.join(''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() || DEFAULT_BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}

function ttsPrompt(input: string) {
  return `Read this text aloud exactly as written, without any commentary or extra words:\n\n${input}`
}

export const providerOpenRouterAudioSpeech = defineProvider<OpenRouterAudioConfig>({
  createProvider(config) {
    const apiKey = config.apiKey.trim()
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    return {
      speech: (model?: string) => {
        const resolvedModel = model || DEFAULT_MODEL
        return {
          baseURL: baseUrl,
          fetch: createAudioFetch(apiKey, baseUrl, resolvedModel),
          model: resolvedModel,
        }
      },
    }
  },
  createProviderConfig: () => openRouterAudioConfigSchema,
  description: 'openrouter.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openrouter-audio-speech.description'),
  extraMethods: {
    listModels: async (config) => {
      try {
        const response = await fetch(new URL('models?output_modality=audio', normalizeBaseUrl(config.baseUrl)), {
          headers: OPENROUTER_ATTRIBUTION_HEADERS,
        })
        if (!response.ok)
          return []

        const data = await response.json() as {
          data?: Array<{ context_length?: number, description?: string, id: string, name?: string }>
        }
        return (data.data ?? []).map(model => ({
          contextLength: model.context_length || 0,
          deprecated: false,
          description: model.description || '',
          id: model.id,
          name: model.name || model.id,
          provider: 'openrouter-audio-speech',
        }))
      }
      catch (error) {
        console.error('Failed to fetch OpenRouter audio models:', error)
        return []
      }
    },
    listVoices: async () => openAIVoices.map(id => ({
      id,
      languages: [],
      name: `${id[0].toUpperCase()}${id.slice(1)}`,
      provider: 'openrouter-audio-speech',
    })),
  },
  icon: 'i-lobe-icons:openrouter',
  id: 'openrouter-audio-speech',
  name: 'OpenRouter',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openrouter-audio-speech.title'),
  tasks: ['text-to-speech'],
  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'openrouter-audio-speech:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const valid = Boolean(config.apiKey?.trim())
          return {
            errors: valid ? [] : [{ error: new Error('API Key is required.') }],
            reason: valid ? '' : 'API Key is required.',
            reasonKey: '',
            valid,
          }
        },
      }),
    ],
  },
})
