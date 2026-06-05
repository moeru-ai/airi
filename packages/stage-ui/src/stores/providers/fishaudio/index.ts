import type { SpeechProvider } from '@xsai-ext/providers/utils'

import type { ModelInfo, ProviderMetadata } from '../../providers'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { electronFishAudioTTS } from '@proj-airi/stage-shared'

const DEFAULT_BASE_URL = 'https://api.fish.audio/'
const DEFAULT_MODEL = 's2-pro'
const DEFAULT_OUTPUT_FORMAT = 'mp3' as const
const PROVIDER_ID = 'fishaudio-speech'
const FISH_AUDIO_PROXY_BASE_URL = '/api-fish'
const FISH_AUDIO_MIME_TYPE = 'audio/mpeg'

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBaseUrl(value: unknown): string {
  const baseUrl = normalizeString(value)
  return ensureTrailingSlash(baseUrl || DEFAULT_BASE_URL)
}

function normalizeOutputFormat(_value: unknown): typeof DEFAULT_OUTPUT_FORMAT {
  return DEFAULT_OUTPUT_FORMAT
}

function isDefaultBaseUrl(baseUrl: string): boolean {
  return ensureTrailingSlash(baseUrl) === DEFAULT_BASE_URL
}

function getElectronIpcRenderer(): Parameters<typeof createContext>[0] | undefined {
  return (globalThis as { window?: { electron?: { ipcRenderer?: Parameters<typeof createContext>[0] } } }).window?.electron?.ipcRenderer
}

function decodeBase64Audio(base64: string): ArrayBuffer {
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/**
 * Resolves the effective Fish Audio API key.
 *
 * Use when:
 * - Fish Audio credentials are stored in the provider configuration
 * - UI and provider code need one consistent trimmed-key check
 *
 * Expects:
 * - `configApiKey` may be omitted or contain surrounding whitespace
 *
 * Returns:
 * - The trimmed provider key, or an empty string when no provider key exists
 */
export function getFishAudioApiKey(configApiKey?: unknown): string {
  return normalizeString(configApiKey)
}

function buildFishAudioHeaders(apiKey: string, contentType?: string): HeadersInit {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(contentType ? { 'Content-Type': contentType } : {}),
  }
}

function resolveFishAudioRequestBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = ensureTrailingSlash(baseUrl)
  const shouldUseProxy = import.meta.env.DEV
    && isDefaultBaseUrl(normalizedBaseUrl)

  return ensureTrailingSlash(shouldUseProxy ? FISH_AUDIO_PROXY_BASE_URL : normalizedBaseUrl)
}

async function invokeElectronFishAudioTts(payload: {
  apiKey: string
  baseUrl: string
  chunkLength?: number
  latency: string
  model: string
  mp3Bitrate?: number
  normalize: boolean
  referenceId?: string
  text: string
}): Promise<Response> {
  const ipcRenderer = getElectronIpcRenderer()
  if (!ipcRenderer) {
    throw new Error('Electron ipcRenderer is not available for Fish Audio TTS.')
  }

  const { context } = createContext(ipcRenderer)
  const invokeTts = defineInvoke(context, electronFishAudioTTS)
  const result = await invokeTts({
    ...payload,
    baseUrl: ensureTrailingSlash(payload.baseUrl),
  })

  const audioBlob = new Blob([decodeBase64Audio(result.audioBase64)], {
    type: result.mimeType,
  })

  return new Response(audioBlob, {
    status: result.status,
    statusText: result.statusText,
    headers: {
      'Content-Type': result.mimeType,
    },
  })
}

async function buildErrorFromResponse(response: Response): Promise<Error> {
  const errorText = await response.text().catch(() => '')
  const details = errorText ? `: ${errorText}` : ''
  return new Error(`Fish Audio TTS request failed: ${response.status} ${response.statusText}${details}`)
}

function createAudioFetch(baseUrl: string, apiKey: string, defaultModel: string) {
  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!init?.body || typeof init.body !== 'string') {
      throw new Error('Invalid request body')
    }

    const body = JSON.parse(init.body) as Record<string, unknown>
    const text = normalizeString(body.input)
    if (!text) {
      throw new Error('Fish Audio TTS request missing input text')
    }

    const model = normalizeString(body.model) || defaultModel
    // NOTICE:
    // Safari WebKit is sensitive to missing or incorrectly sniffed audio MIME types.
    // Fish Audio should stay on a strict MP3 path so the request payload and playback blob
    // both resolve to a stable `audio/mpeg` contract on Apple devices.
    // Removal condition: Fish Audio exposes a guaranteed MIME-safe playback contract for Safari.
    const responseFormat = normalizeOutputFormat(body.response_format)
    const referenceId = normalizeString(body.voice)

    const payload: Record<string, unknown> = {
      text,
      format: responseFormat,
      normalize: body.normalize ?? true,
      latency: body.latency ?? 'normal',
    }

    if (model && model !== DEFAULT_MODEL) {
      payload.model = model
    }

    if (referenceId && referenceId !== 'default') {
      payload.reference_id = referenceId
    }

    if (typeof body.chunk_length === 'number') {
      payload.chunk_length = body.chunk_length
    }

    if (responseFormat === 'mp3' && typeof body.mp3_bitrate === 'number') {
      payload.mp3_bitrate = body.mp3_bitrate
    }

    if (!import.meta.env.DEV && isDefaultBaseUrl(baseUrl) && getElectronIpcRenderer()) {
      return invokeElectronFishAudioTts({
        apiKey,
        baseUrl,
        text,
        model: (payload as { model?: string }).model || DEFAULT_MODEL,
        normalize: Boolean(payload.normalize),
        latency: String(payload.latency),
        referenceId,
        chunkLength: typeof payload.chunk_length === 'number' ? payload.chunk_length : undefined,
        mp3Bitrate: typeof payload.mp3_bitrate === 'number' ? payload.mp3_bitrate : undefined,
      })
    }

    const requestBaseUrl = resolveFishAudioRequestBaseUrl(baseUrl)
    const headers = new Headers(buildFishAudioHeaders(apiKey, 'application/json'))
    headers.set('model', (payload as any).model || 's2-pro')
    const response = await globalThis.fetch(`${requestBaseUrl}v1/tts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw await buildErrorFromResponse(response)
    }

    const audioBuffer = await response.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], {
      type: FISH_AUDIO_MIME_TYPE,
    })

    return new Response(audioBlob, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': audioBlob.type,
      },
    })
  }
}

function createSpeechProvider(baseUrl: string, apiKey: string): SpeechProvider {
  return {
    speech: (model?: string) => {
      const resolvedModel = normalizeString(model) || DEFAULT_MODEL
      return {
        baseURL: `${baseUrl}v1/`,
        model: resolvedModel,
        fetch: createAudioFetch(baseUrl, apiKey, resolvedModel),
      }
    },
  }
}

function listModels(searchTerm = ''): ModelInfo[] {
  const models: ModelInfo[] = [
    {
      id: 's2-pro',
      name: 'S2 Pro (High Quality)',
      provider: PROVIDER_ID,
      description: 'High-quality Fish Audio speech model',
      contextLength: 0,
      deprecated: false,
    },
    {
      id: 's1',
      name: 'S1 (Low Latency)',
      provider: PROVIDER_ID,
      description: 'Low-latency Fish Audio speech model',
      contextLength: 0,
      deprecated: false,
    },
  ]

  const normalizedSearchTerm = normalizeString(searchTerm).toLowerCase()
  if (!normalizedSearchTerm) {
    return models
  }

  return models.filter(model =>
    model.id.toLowerCase().includes(normalizedSearchTerm)
    || model.name.toLowerCase().includes(normalizedSearchTerm)
    || model.description?.toLowerCase().includes(normalizedSearchTerm),
  )
}

interface FishAudioVoiceItem {
  _id: string
  title: string
}

interface FishAudioVoiceListResponse {
  items?: FishAudioVoiceItem[]
}

export interface FishAudioVoiceOption {
  value: string
  label: string
}

const voiceCache = new Map<string, FishAudioVoiceOption[]>()

interface FishAudioVoiceQueryOptions {
  apiKey?: unknown
  baseUrl?: unknown
  pageSize?: number
  query?: string
  searchTerm?: string
  id?: string
}

interface FishAudioModelListResult {
  items: FishAudioVoiceItem[]
  status: number
}

function resolveModelsEndpoint(baseUrl: unknown): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const requestBaseUrl = resolveFishAudioRequestBaseUrl(normalizedBaseUrl)
  return `${requestBaseUrl}model`
}

async function requestFishAudioModels(options: FishAudioVoiceQueryOptions = {}): Promise<FishAudioModelListResult> {
  const searchTerm = normalizeString(options.searchTerm ?? options.query)
  const searchParams = new URLSearchParams({
    page_size: String(options.pageSize ?? 20),
  })
  if (searchTerm) {
    searchParams.set('title', searchTerm)
  }

  const apiKey = getFishAudioApiKey(options.apiKey)
  const response = await globalThis.fetch(`${resolveModelsEndpoint(options.baseUrl)}?${searchParams.toString()}`, {
    headers: buildFishAudioHeaders(apiKey),
  })

  if (!response.ok) {
    throw await buildErrorFromResponse(response)
  }

  const payload = await response.json() as FishAudioVoiceListResponse

  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    status: response.status,
  }
}

async function requestFishAudioModelById(id: string, options: FishAudioVoiceQueryOptions = {}): Promise<FishAudioVoiceItem> {
  const apiKey = getFishAudioApiKey(options.apiKey)
  const response = await globalThis.fetch(`${resolveModelsEndpoint(options.baseUrl)}/${id}`, {
    headers: buildFishAudioHeaders(apiKey),
  })

  if (!response.ok) {
    throw await buildErrorFromResponse(response)
  }

  return await response.json() as FishAudioVoiceItem
}

async function fetchVoiceOptions(options: FishAudioVoiceQueryOptions = {}): Promise<FishAudioVoiceOption[]> {
  const { items } = await requestFishAudioModels(options)

  return items.map(item => ({
    value: item._id,
    label: item.title,
  }))
}

function extractErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  if ('status' in error) {
    const status = Reflect.get(error, 'status')
    if (typeof status === 'number') {
      return status
    }
  }

  if ('response' in error) {
    const response = Reflect.get(error, 'response')
    if (response && typeof response === 'object' && 'status' in response) {
      const status = Reflect.get(response, 'status')
      if (typeof status === 'number') {
        return status
      }
    }
  }

  return undefined
}

/**
 * Loads Fish Audio voices for a remote combobox query.
 *
 * Before:
 * - query = "grace"
 *
 * After:
 * - GET /api-fish/model?page_size=20&title=grace
 */
export async function listVoices(options: string | FishAudioVoiceQueryOptions = ''): Promise<FishAudioVoiceOption[]> {
  const queryOptions = typeof options === 'string' ? { searchTerm: options } : options
  const apiKey = getFishAudioApiKey(queryOptions.apiKey)
  const baseUrl = normalizeBaseUrl(queryOptions.baseUrl)

  if (queryOptions.id) {
    const cacheKey = `id:${apiKey}:${baseUrl}:${queryOptions.id}`
    if (voiceCache.has(cacheKey)) {
      return voiceCache.get(cacheKey)!
    }
    try {
      const item = await requestFishAudioModelById(queryOptions.id, queryOptions)
      const results = [{ value: item._id, label: item.title }]
      voiceCache.set(cacheKey, results)
      return results
    }
    catch (error) {
      console.error(`Failed to fetch Fish Audio voice by ID ${queryOptions.id}:`, error)
      return []
    }
  }

  const searchTerm = normalizeString(queryOptions.searchTerm ?? queryOptions.query)
  const cacheKey = `${apiKey}:${baseUrl}:${searchTerm}`

  if (voiceCache.has(cacheKey)) {
    return voiceCache.get(cacheKey)!
  }

  const results = await fetchVoiceOptions(queryOptions)
  voiceCache.set(cacheKey, results)
  return results
}

async function validateFishAudioConfiguration(
  config: Record<string, unknown>,
  baseUrlValidator: (baseUrl: unknown) => { errors: unknown[], reason: string, valid: boolean } | null | undefined,
): Promise<{ errors: Error[], reason: string, valid: boolean }> {
  const errors: Error[] = []
  const apiKey = getFishAudioApiKey(config.apiKey)

  function logValidation(result: { errors: Error[], reason: string, valid: boolean }, status?: number) {
    // eslint-disable-next-line no-console
    console.log('[FishAudio Validation]', {
      endpoint: resolveModelsEndpoint(config.baseUrl),
      hasApiKey: Boolean(apiKey),
      status,
      result,
    })

    return result
  }

  if (!apiKey) {
    errors.push(new Error('API key is required.'))
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl)
  if (baseUrl) {
    const result = baseUrlValidator(baseUrl)
    if (result) {
      return logValidation({
        errors: (result.errors as Error[]) || [],
        reason: result.reason,
        valid: result.valid,
      })
    }
  }

  if (errors.length > 0) {
    return logValidation({
      errors,
      reason: errors.map(error => error.message).join(', '),
      valid: false,
    })
  }

  try {
    const { status } = await requestFishAudioModels({
      apiKey,
      baseUrl: config.baseUrl,
      pageSize: 1,
      query: '',
    })

    return logValidation({
      errors: [],
      reason: '',
      valid: true,
    }, status)
  }
  catch (error) {
    console.error('[FishAudio Validation Error Detail]', error)

    const status = extractErrorStatus(error)
    const result = {
      errors: [new Error(errorMessageFrom(error) ?? 'Failed to validate Fish Audio provider')],
      reason: errorMessageFrom(error) ?? 'Failed to validate Fish Audio provider',
      valid: false,
    }

    return logValidation(result, status)
  }
}

/**
 * Builds Fish Audio speech-provider metadata backed by the `/v1/tts` endpoint.
 *
 * Use when:
 * - AIRI needs a Fish Audio text-to-speech provider in the legacy speech registry
 * - The xsAI speech request must be translated into Fish Audio's JSON TTS payload
 *
 * Expects:
 * - `config.baseUrl` is either empty or an absolute Fish Audio-compatible base URL
 *
 * Returns:
 * - Provider metadata that exposes a custom fetch adapter for `/v1/tts`
 */
export function buildFishAudioSpeechProvider(
  baseUrlValidator: (baseUrl: unknown) => { errors: unknown[], reason: string, valid: boolean } | null | undefined,
): ProviderMetadata {
  return {
    id: PROVIDER_ID,
    category: 'speech',
    tasks: ['text-to-speech'],
    nameKey: 'settings.pages.providers.provider.fishaudio-speech.title',
    name: 'Fish Audio',
    descriptionKey: 'settings.pages.providers.provider.fishaudio-speech.description',
    description: 'fish.audio',
    icon: 'i-lucide:audio-lines',
    defaultOptions: () => ({
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      format: DEFAULT_OUTPUT_FORMAT,
    }),
    createProvider: async (config) => {
      const baseUrl = normalizeBaseUrl(config.baseUrl)
      const apiKey = getFishAudioApiKey(config.apiKey)
      return createSpeechProvider(baseUrl, apiKey)
    },
    capabilities: {
      listModels: async config => listModels(normalizeString(config.searchTerm)),
      listVoices: async (config, options) => {
        const parsedOptions = typeof options === 'object' && options !== null
          ? options
          : { model: options }

        const voices = await listVoices({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          searchTerm: parsedOptions.searchTerm || '',
          id: parsedOptions.id,
        })
        return voices.map(voice => ({
          id: voice.value,
          name: voice.label,
          provider: PROVIDER_ID,
          languages: [],
        }))
      },
      voiceSearchMode: 'remote',
    },
    validators: {
      chatPingCheckAvailable: false,
      validateProviderConfig: async config => validateFishAudioConfiguration(config, baseUrlValidator),
    },
  }
}
