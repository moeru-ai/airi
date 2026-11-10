import { errorMessageFrom } from '@moeru/std'
import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { EventSourceParserStream } from '@xsai/shared-stream'
import { z } from 'zod'

import * as v from 'valibot'

import { defineProvider } from '../../registry'
import { OPENROUTER_ATTRIBUTION_HEADERS } from '../openrouter-ai'

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1/'
const DEFAULT_MODEL = 'openai/gpt-audio-mini'

const openRouterAudioConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
})

type OpenRouterAudioConfig = z.input<typeof openRouterAudioConfigSchema>

/** Only these chat models have the supported PCM16 speech contract. Audio modality alone also includes music models. */
const chatAudioModels = new Set(['openai/gpt-audio', 'openai/gpt-audio-mini'])

/** Supported chat voice policy when OpenRouter omits metadata. An explicit empty catalog remains empty. */
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

const modelsSchema = v.object({
  data: v.array(v.object({
    id: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    context_length: v.optional(v.number()),
    architecture: v.object({ output_modalities: v.array(v.string()) }),
    endpoints: v.optional(v.array(v.string())),
    supported_voices: v.nullish(v.array(v.string())),
  })),
})

type CatalogModel = v.InferOutput<typeof modelsSchema>['data'][number]
type DiscoveredModel = CatalogModel & {
  speech: boolean
  chatAudio: boolean
}

const requestSchema = v.looseObject({
  input: v.string(),
  voice: v.optional(v.string()),
  response_format: v.optional(v.string()),
})

const chunkSchema = v.object({
  error: v.optional(v.unknown()),
  choices: v.optional(v.array(v.object({
    delta: v.optional(v.object({
      audio: v.optional(v.object({ data: v.optional(v.string()) })),
    })),
  }))),
})

/**
 * Normalizes the configured API root so relative endpoint URLs preserve its path.
 * @example
 * normalizeBaseUrl('https://example.com/api/v1')
 * // => 'https://example.com/api/v1/'
 */
function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() || DEFAULT_BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}

function ttsPrompt(input: string) {
  return `Read this text aloud exactly as written, without any commentary or extra words:\n\n${input}`
}

async function collectAudio(body: ReadableStream<Uint8Array<ArrayBuffer>>) {
  const chunks: Uint8Array[] = []
  let completed = false
  const events = body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
  for await (const { data } of events) {
    if (!data)
      continue
    if (data === '[DONE]') {
      completed = true
      break
    }

    const event = v.parse(chunkSchema, JSON.parse(data))
    if (event.error)
      throw new Error(`OpenRouter audio stream failed: ${JSON.stringify(event.error)}`)
    const audio = event.choices?.[0]?.delta?.audio?.data
    if (audio)
      chunks.push(Uint8Array.from(atob(audio), character => character.charCodeAt(0)))
  }

  // Chat Completions ends with [DONE]. EOF alone can leave valid but truncated audio.
  // https://openrouter.ai/docs/api/reference/streaming
  if (!completed)
    throw new Error('OpenRouter audio stream ended before [DONE]')

  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  if (!bytes.length)
    throw new Error('OpenRouter audio response contains no audio')
  return bytes
}

function pcmSampleRate(model: string) {
  // NOTICE:
  // These models need WAV for playback.
  // OpenRouter exposes no encoding metadata in the model catalog.
  // HeyGen specifies signed PCM16 LE, mono, 44.1 kHz. Gemini specifies PCM16 LE, mono, 24 kHz.
  // Sources: https://developers.heygen.com/docs/voices/heygen-voice-speech#output-format
  // https://ai.google.dev/gemini-api/docs/speech-generation#audio-output-formats
  // https://openrouter.ai/docs/guides/overview/multimodal/tts
  // Replace this table when the catalog exposes encoding metadata.
  switch (model) {
    case 'heygen/heygen-voice-1':
    case 'heygen/heygen-voice-1-turbo':
    case 'heygen/heygen-voice-1-turbo:free':
      return 44100
    case 'google/gemini-3.1-flash-tts-preview':
    case 'google/gemini-3.8-flash-tts':
    case 'google/gemini-3.8-flash-lite-tts':
      return 24000
  }
}

function wavResponse(bytes: Uint8Array, sampleRate: number) {
  if (bytes.byteLength % 2 !== 0)
    throw new Error('OpenRouter PCM response contains an incomplete 16-bit sample')
  return new Response(toWavFromPCM16(bytes, sampleRate), {
    headers: { 'Content-Type': 'audio/wav' },
  })
}

/**
 * Owns discovery for one configured API root and key. Explicit model-list requests refresh the catalog.
 * Synthesis refreshes a missing model because dropdown discovery uses separate temporary instances.
 * Each modality retains its last successful response during a partial failure. Canceled discovery never changes either catalog.
 */
class OpenRouterSpeech {
  private models?: Map<string, DiscoveredModel>
  private catalogs = new Map<string, CatalogModel[]>()

  constructor(private readonly apiKey: string, private readonly baseUrl: string) {}

  private headers(init?: HeadersInit) {
    const headers = new Headers(init)
    headers.set('Authorization', `Bearer ${this.apiKey}`)
    for (const [key, value] of Object.entries(OPENROUTER_ATTRIBUTION_HEADERS))
      headers.set(key, value)
    return headers
  }

  async discover(signal?: AbortSignal | null) {
    signal?.throwIfAborted()
    const queries = ['output_modalities=speech', 'output_modality=audio']
    const results = await Promise.allSettled(queries.map(async (query) => {
      const response = await globalThis.fetch(new URL(`models?${query}`, this.baseUrl), {
        headers: this.headers(),
        signal,
      })
      if (!response.ok)
        throw new Error(`OpenRouter model discovery failed: ${response.status} ${await response.text()}`)
      return v.parse(modelsSchema, await response.json()).data
    }))
    signal?.throwIfAborted()

    const catalogs = new Map(this.catalogs)
    const failures: Array<{ query: string, message: string }> = []
    for (const [index, result] of results.entries()) {
      const query = queries[index]!
      if (result.status === 'fulfilled') {
        catalogs.set(query, result.value)
      }
      else {
        const reason: unknown = result.reason
        if ((reason instanceof Error || reason instanceof DOMException) && reason.name === 'AbortError')
          throw reason
        failures.push({ query, message: errorMessageFrom(reason) ?? 'Unknown discovery error' })
      }
    }

    const entries: CatalogModel[] = []
    for (const query of queries) {
      const catalog = catalogs.get(query)
      if (catalog)
        entries.push(...catalog)
    }
    const models = new Map<string, DiscoveredModel>()
    for (const entry of entries) {
      const modalities = entry.architecture.output_modalities
      const speech = modalities.includes('speech') && (!entry.endpoints || entry.endpoints.includes('/api/v1/audio/speech'))
      const chatAudio = chatAudioModels.has(entry.id) && modalities.includes('audio')
        && (!entry.endpoints || entry.endpoints.includes('/api/v1/chat/completions'))
      if (!speech && !chatAudio)
        continue

      const previous = models.get(entry.id)
      // Speech metadata takes precedence. Duplicate entries contribute their endpoint capabilities and voices.
      if (previous) {
        previous.speech ||= speech
        previous.chatAudio ||= chatAudio
        if (entry.supported_voices) {
          previous.supported_voices = previous.supported_voices
            ? [...new Set([...previous.supported_voices, ...entry.supported_voices])]
            : entry.supported_voices
        }
      }
      else {
        models.set(entry.id, { ...entry, speech, chatAudio })
      }
    }
    if (failures.length === queries.length || (failures.length && !models.size))
      throw new Error(`OpenRouter model discovery failed:\n${failures.map(({ query, message }) => `${query}: ${message}`).join('\n')}`)

    // Each catalog is independent. Report degraded discovery while retaining usable current or previously discovered capabilities.
    for (const { query, message } of failures)
      console.warn(`OpenRouter model catalog ${query} unavailable:`, message)
    this.catalogs = catalogs
    this.models = models
    return models
  }

  private async resolveModel(id: string, signal?: AbortSignal | null) {
    signal?.throwIfAborted()
    const model = this.models?.get(id) ?? (await this.discover(signal)).get(id)
    if (!model)
      throw new Error(`OpenRouter model does not advertise speech or chat-audio support: ${id}`)
    return model
  }

  async listVoices(id = DEFAULT_MODEL, signal?: AbortSignal) {
    const model = await this.resolveModel(id, signal)
    let voices: readonly string[] | null | undefined = model.supported_voices
    if (voices == null) {
      // This supported policy is limited to discovered OpenAI chat-audio capabilities.
      // Dedicated speech models require their catalog or the Speech module's manual voice selection.
      if (!model.speech && model.chatAudio)
        voices = openAIVoices
      else
        return []
    }
    return voices.map(voice => ({
      id: voice,
      name: voice,
      provider: 'openrouter-audio-speech',
      languages: [],
      compatibleModels: [id],
    }))
  }

  speech(model?: string) {
    const resolvedModel = model || DEFAULT_MODEL
    return {
      baseURL: this.baseUrl,
      model: resolvedModel,
      fetch: (_input: RequestInfo | URL, init?: RequestInit) => this.synthesize(resolvedModel, init),
    }
  }

  private async synthesize(id: string, init?: RequestInit) {
    if (typeof init?.body !== 'string')
      throw new Error('Invalid request body')
    const body = v.parse(requestSchema, JSON.parse(init.body))
    const model = await this.resolveModel(id, init.signal)
    const format = model.speech ? v.parse(v.optional(v.picklist(['mp3', 'pcm'])), body.response_format) : undefined
    const sampleRate = pcmSampleRate(id)
    const headers = this.headers(init.headers)
    headers.set('Content-Type', 'application/json')
    const response = await globalThis.fetch(new URL(model.speech ? 'audio/speech' : 'chat/completions', this.baseUrl), {
      ...init,
      method: 'POST',
      headers,
      body: JSON.stringify(model.speech
        ? { ...body, model: id, response_format: sampleRate ? 'pcm' : format ?? 'mp3' }
        : {
            model: id,
            messages: [{ role: 'user', content: ttsPrompt(body.input) }],
            modalities: ['text', 'audio'],
            audio: { voice: body.voice, format: 'pcm16' },
            stream: true,
          }),
    })
    if (!response.ok)
      throw new Error(`OpenRouter audio request failed: ${response.status} ${await response.text()}`)
    if (!response.body)
      throw new Error('OpenRouter audio response has no body')

    if (!model.speech) {
      const audio = await collectAudio(response.body)
      init.signal?.throwIfAborted()
      return wavResponse(audio, 24000)
    }

    const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
    if (contentType !== 'audio/pcm' && contentType !== 'audio/wav' && contentType !== 'audio/mpeg')
      throw new Error(`Unexpected OpenRouter speech response: ${contentType} ${await response.text()}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    init.signal?.throwIfAborted()
    if (!bytes.length)
      throw new Error('OpenRouter audio response contains no audio')

    // Gemini unary output can already contain a WAV header, even when the requested format is PCM.
    const isWav = bytes.byteLength >= 44 && new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF'
      && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WAVE'
    if (isWav || contentType === 'audio/mpeg') {
      return new Response(bytes, { headers: { 'Content-Type': isWav ? 'audio/wav' : 'audio/mpeg' } })
    }
    if (contentType !== 'audio/pcm' || !sampleRate)
      throw new Error(`OpenRouter returned audio without a supported PCM encoding contract: ${id}`)
    return wavResponse(bytes, sampleRate)
  }
}

export const providerOpenRouterAudioSpeech = defineProvider<OpenRouterAudioConfig, 'openrouter-audio-speech'>({
  id: 'openrouter-audio-speech',
  name: 'OpenRouter',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openrouter-audio-speech.title'),
  description: 'openrouter.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openrouter-audio-speech.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:openrouter',
  createProviderConfig: () => openRouterAudioConfigSchema,
  capabilities: { speech: { transport: 'rest', voicesByModel: true } },
  createProvider: config => new OpenRouterSpeech(config.apiKey.trim(), normalizeBaseUrl(config.baseUrl)),
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
  extraMethods: {
    listModels: async (_config, provider) => {
      if (!(provider instanceof OpenRouterSpeech))
        throw new Error('Invalid OpenRouter speech provider instance')
      const models = await provider.discover()
      return [...models.values()].map(model => ({
        id: model.id,
        name: model.name || model.id,
        provider: 'openrouter-audio-speech',
        description: model.description ?? '',
        contextLength: model.context_length ?? 0,
        deprecated: false,
      }))
    },
    voiceCatalogConfig: ({ apiKey, baseUrl }) => ({ apiKey: apiKey.trim(), baseUrl: normalizeBaseUrl(baseUrl) }),
    listVoices: async (_config, provider, model, signal) => {
      if (!(provider instanceof OpenRouterSpeech))
        throw new Error('Invalid OpenRouter speech provider instance')
      return provider.listVoices(model, signal)
    },
  },
})
