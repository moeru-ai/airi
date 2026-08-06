import type { SpeechProviderWithExtraOptions, TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../registry'

export const VOICEBOX_SPEECH_PROVIDER_ID = 'voicebox-local-speech'
export const VOICEBOX_TRANSCRIPTION_PROVIDER_ID = 'voicebox-local-transcription'

const VOICEBOX_DEFAULT_BASE_URL = 'http://127.0.0.1:17493/'
const VOICEBOX_COMPATIBLE_BASE_URL = 'http://voicebox.invalid/v1/'
const VOICEBOX_DEV_PROXY_PATH = '/__voicebox'
const VOICEBOX_DEFAULT_SPEECH_MODEL = 'qwen-tts-1.7B'
const VOICEBOX_DEFAULT_TRANSCRIPTION_MODEL = 'base'

const voiceboxBaseConfigSchema = z.object({
  baseUrl: z.string().default(VOICEBOX_DEFAULT_BASE_URL),
  language: z.string().default('zh'),
})

const voiceboxSpeechConfigSchema = voiceboxBaseConfigSchema.extend({
  model: z.string().default(VOICEBOX_DEFAULT_SPEECH_MODEL),
})

const voiceboxTranscriptionConfigSchema = voiceboxBaseConfigSchema.extend({
  model: z.string().default(VOICEBOX_DEFAULT_TRANSCRIPTION_MODEL),
})

type VoiceboxSpeechConfig = z.input<typeof voiceboxSpeechConfigSchema>
type VoiceboxTranscriptionConfig = z.input<typeof voiceboxTranscriptionConfigSchema>

interface VoiceboxSpeechOptions {
  language?: string
}

interface VoiceboxTranscriptionOptions {
  language?: string
}

interface VoiceboxHealthResponse {
  status?: string
}

interface VoiceboxModelStatus {
  display_name: string
  downloaded: boolean
  downloading: boolean
  model_name: string
}

interface VoiceboxModelStatusResponse {
  models: VoiceboxModelStatus[]
}

interface VoiceboxProfile {
  description?: string | null
  id: string
  language: string
  name: string
}

interface VoiceboxErrorEnvelope {
  detail?: string | { message?: string }
  error?: string | { message?: string }
  message?: string
}

interface VoiceboxSpeechRequestBody {
  input?: unknown
  language?: unknown
  model?: unknown
  voice?: unknown
}

interface VoiceboxSpeechModel {
  engine: 'qwen' | 'qwen_custom_voice'
  modelSize: '0.6B' | '1.7B'
}

function normalizedBaseUrl(value: string | undefined) {
  const baseUrl = value?.trim() || VOICEBOX_DEFAULT_BASE_URL
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

function isLoopbackHostname(hostname: string) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}

/**
 * Resolves Voicebox API requests through the local Vite proxy during
 * development. Production builds connect directly because the proxy route
 * only exists while Vite's development server is running.
 */
function voiceboxEndpoint(baseUrl: string | undefined, path: string) {
  const base = new URL(normalizedBaseUrl(baseUrl))
  const location = globalThis.location

  if (
    import.meta.env.DEV
      && location
      && (location.protocol === 'http:' || location.protocol === 'https:')
      && isLoopbackHostname(location.hostname)
      && isLoopbackHostname(base.hostname)
      && base.port === '17493'
  ) {
    return new URL(`${VOICEBOX_DEV_PROXY_PATH}${path}`, location.origin)
  }

  return new URL(path.replace(/^\//, ''), base)
}

function requestVoicebox(baseUrl: string | undefined, path: string, init?: RequestInit) {
  return globalThis.fetch(voiceboxEndpoint(baseUrl, path), {
    ...init,
    credentials: 'omit',
  })
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response))
  }

  return await response.json() as T
}

async function responseErrorMessage(response: Response) {
  const fallback = `Voicebox request failed: HTTP ${response.status} ${response.statusText}`

  try {
    const body = await response.json() as VoiceboxErrorEnvelope
    if (typeof body.detail === 'string')
      return body.detail
    if (body.detail && typeof body.detail.message === 'string')
      return body.detail.message
    if (typeof body.error === 'string')
      return body.error
    if (body.error && typeof body.error.message === 'string')
      return body.error.message
    if (typeof body.message === 'string')
      return body.message
  }
  catch {
  }

  return fallback
}

function errorResponse(message: string, status = 400) {
  return Response.json({
    error: {
      code: status === 503 ? 'model_loading' : 'invalid_request',
      message,
      type: status === 503 ? 'service_unavailable_error' : 'invalid_request_error',
    },
  }, { status })
}

async function mapPreparingResponse(response: Response, fallback: string) {
  if (response.status !== 202)
    return response

  return errorResponse(await responseErrorMessage(response).catch(() => fallback), 503)
}

function parseSpeechRequestBody(body: BodyInit | null | undefined): VoiceboxSpeechRequestBody | undefined {
  if (typeof body !== 'string')
    return undefined

  try {
    const value = JSON.parse(body) as unknown
    return value && typeof value === 'object' ? value as VoiceboxSpeechRequestBody : undefined
  }
  catch {
    return undefined
  }
}

function speechModel(modelId: string): VoiceboxSpeechModel | undefined {
  const baseMatch = /^qwen-tts-(0\.6b|1\.7b)$/i.exec(modelId)
  if (baseMatch) {
    return {
      engine: 'qwen',
      modelSize: baseMatch[1].toLowerCase() === '1.7b' ? '1.7B' : '0.6B',
    }
  }

  const customVoiceMatch = /^qwen-custom-voice-(0\.6b|1\.7b)$/i.exec(modelId)
  if (customVoiceMatch) {
    return {
      engine: 'qwen_custom_voice',
      modelSize: customVoiceMatch[1].toLowerCase() === '1.7b' ? '1.7B' : '0.6B',
    }
  }

  return undefined
}

function speechFetch(config: VoiceboxSpeechConfig, configuredModel: string, options?: VoiceboxSpeechOptions): typeof fetch {
  return async (_input, init) => {
    const body = parseSpeechRequestBody(init?.body)
    if (!body)
      return errorResponse('Voicebox received an invalid speech request body.')

    const input = typeof body.input === 'string' ? body.input.trim() : ''
    const profileId = typeof body.voice === 'string' ? body.voice.trim() : ''
    const modelId = typeof body.model === 'string' ? body.model : configuredModel
    const model = speechModel(modelId)

    if (!input)
      return errorResponse('Speech text is required.')
    if (!profileId)
      return errorResponse('Select a Voicebox voice profile before generating speech.')
    if (!model)
      return errorResponse(`Unsupported Voicebox speech model: ${modelId}`)

    const language = typeof body.language === 'string'
      ? body.language
      : options?.language || config.language || 'zh'

    const response = await requestVoicebox(config.baseUrl, '/generate/stream', {
      body: JSON.stringify({
        engine: model.engine,
        language,
        model_size: model.modelSize,
        profile_id: profileId,
        text: input,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: init?.signal,
    })
    const preparedResponse = await mapPreparingResponse(response, 'Voicebox is preparing the selected Qwen TTS model. Wait for the download to finish and try again.')

    if (preparedResponse.ok && !preparedResponse.headers.get('Content-Type')?.startsWith('audio/')) {
      return errorResponse('Voicebox returned a non-audio response for speech generation.', 502)
    }

    return preparedResponse
  }
}

function transcriptionModel(modelId: string) {
  return modelId.replace(/^whisper-/i, '') || VOICEBOX_DEFAULT_TRANSCRIPTION_MODEL
}

function transcriptionFetch(config: VoiceboxTranscriptionConfig, configuredModel: string, options?: VoiceboxTranscriptionOptions): typeof fetch {
  return async (_input, init) => {
    if (typeof FormData === 'undefined' || !(init?.body instanceof FormData))
      return errorResponse('Voicebox received an invalid transcription request body.')

    const sourceFile = init.body.get('file')
    if (!(sourceFile instanceof Blob))
      return errorResponse('An audio file is required for transcription.')

    const requestModel = init.body.get('model')
    const requestLanguage = init.body.get('language')
    const form = new FormData()
    const fileName = typeof File !== 'undefined' && sourceFile instanceof File && sourceFile.name
      ? sourceFile.name
      : 'recording.wav'

    form.append('file', sourceFile, fileName)
    form.append('model', transcriptionModel(typeof requestModel === 'string' ? requestModel : configuredModel))
    form.append('language', typeof requestLanguage === 'string' ? requestLanguage : options?.language || config.language || 'zh')

    const response = await requestVoicebox(config.baseUrl, '/transcribe', {
      body: form,
      method: 'POST',
      signal: init.signal,
    })

    return await mapPreparingResponse(response, 'Voicebox is downloading the selected Whisper model. Wait for the download to finish and try again.')
  }
}

function configValidator<TConfig extends { baseUrl?: string }>({ t }: { t: (key: string) => string }) {
  return {
    id: 'voicebox:check-config',
    name: t('settings.pages.providers.provider.voicebox-local.validators.config'),
    validator: (config: TConfig) => {
      const errors: Array<{ error: unknown }> = []
      try {
        const url = new URL(normalizedBaseUrl(config.baseUrl))
        if (!['http:', 'https:'].includes(url.protocol))
          errors.push({ error: new Error('Voicebox Base URL must use HTTP or HTTPS.') })
      }
      catch {
        errors.push({ error: new Error('Voicebox Base URL must be an absolute URL.') })
      }

      return {
        errors,
        reason: errors.map(item => errorMessageFrom(item.error) ?? 'Invalid Voicebox configuration.').join(', '),
        reasonKey: '',
        valid: errors.length === 0,
      }
    },
  }
}

function healthValidator<TConfig extends { baseUrl?: string }>({ t }: { t: (key: string) => string }) {
  return {
    id: 'voicebox:check-health',
    name: t('settings.pages.providers.provider.voicebox-local.validators.health'),
    schedule: {
      intervalMs: 15_000,
      mode: 'interval' as const,
    },
    validator: async (config: TConfig) => {
      const errors: Array<{ error: unknown }> = []

      try {
        const health = await requestVoicebox(config.baseUrl, '/health', { method: 'GET' }).then(responseJson<VoiceboxHealthResponse>)
        if (health.status !== 'healthy')
          errors.push({ error: new Error(`Voicebox reported status: ${health.status || 'unknown'}.`) })
      }
      catch (error) {
        errors.push({ error })
      }

      return {
        errors,
        reason: errors.length > 0
          ? errors.map(item => errorMessageFrom(item.error) ?? 'Voicebox is unavailable.').join(', ')
          : '',
        reasonKey: '',
        valid: errors.length === 0,
      }
    },
  }
}

function baseConfigMetadata(t: (key: string) => string) {
  return {
    baseUrl: voiceboxBaseConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.provider.voicebox-local.fields.base-url.description'),
      placeholderLocalized: VOICEBOX_DEFAULT_BASE_URL,
    }),
    language: voiceboxBaseConfigSchema.shape.language.meta({
      labelLocalized: t('settings.pages.providers.provider.voicebox-local.fields.language.label'),
      descriptionLocalized: t('settings.pages.providers.provider.voicebox-local.fields.language.description'),
    }),
  }
}

export const providerVoiceboxSpeech = defineProvider<VoiceboxSpeechConfig>({
  id: VOICEBOX_SPEECH_PROVIDER_ID,
  name: 'Voicebox (Local Qwen TTS)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.voicebox-local-speech.title'),
  description: 'Local Qwen TTS through Voicebox.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.voicebox-local-speech.description'),
  tasks: ['text-to-speech', 'tts'],
  icon: 'i-solar:soundwave-bold-duotone',
  requiresCredentials: false,
  createProviderConfig: ({ t }) => voiceboxSpeechConfigSchema.extend({
    ...baseConfigMetadata(t),
    model: voiceboxSpeechConfigSchema.shape.model.meta({
      labelLocalized: t('settings.pages.providers.provider.voicebox-local.fields.model.label'),
      descriptionLocalized: t('settings.pages.providers.provider.voicebox-local.fields.model.description'),
    }),
  }),
  createProvider(config) {
    const model = config.model || VOICEBOX_DEFAULT_SPEECH_MODEL
    const provider: SpeechProviderWithExtraOptions<string, VoiceboxSpeechOptions> = {
      speech: (requestedModel, options) => ({
        ...options,
        baseURL: VOICEBOX_COMPATIBLE_BASE_URL,
        fetch: speechFetch(config, requestedModel || model, options),
        model: requestedModel || model,
      }),
    }
    return provider
  },
  extraMethods: {
    listModels: async (config) => {
      const response = await requestVoicebox(config.baseUrl, '/models/status', { method: 'GET' }).then(responseJson<VoiceboxModelStatusResponse>)
      return response.models
        .filter(model => model.model_name.startsWith('qwen-tts-') || model.model_name.startsWith('qwen-custom-voice-'))
        .map(model => ({
          id: model.model_name,
          name: model.display_name,
          provider: VOICEBOX_SPEECH_PROVIDER_ID,
          description: model.downloaded ? 'Ready' : model.downloading ? 'Downloading' : 'Downloads on first use',
        }))
    },
    listVoices: async (config) => {
      const profiles = await requestVoicebox(config.baseUrl, '/profiles', { method: 'GET' }).then(responseJson<VoiceboxProfile[]>)
      return profiles.map(profile => ({
        id: profile.id,
        name: profile.name,
        provider: VOICEBOX_SPEECH_PROVIDER_ID,
        description: profile.description || undefined,
        languages: [{ code: profile.language, title: profile.language.toUpperCase() }],
      }))
    },
  },
  validationRequiredWhen: () => true,
  validators: {
    validateConfig: [configValidator<VoiceboxSpeechConfig>],
    validateProvider: [healthValidator<VoiceboxSpeechConfig>],
  },
})

export const providerVoiceboxTranscription = defineProvider<VoiceboxTranscriptionConfig>({
  id: VOICEBOX_TRANSCRIPTION_PROVIDER_ID,
  name: 'Voicebox (Local Whisper ASR)',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.voicebox-local-transcription.title'),
  description: 'Local Whisper transcription through Voicebox.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.voicebox-local-transcription.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-solar:microphone-3-bold-duotone',
  requiresCredentials: false,
  createProviderConfig: ({ t }) => voiceboxTranscriptionConfigSchema.extend({
    ...baseConfigMetadata(t),
    model: voiceboxTranscriptionConfigSchema.shape.model.meta({
      labelLocalized: t('settings.pages.providers.provider.voicebox-local.fields.model.label'),
      descriptionLocalized: t('settings.pages.providers.provider.voicebox-local.fields.model.description'),
    }),
  }),
  createProvider(config) {
    const model = config.model || VOICEBOX_DEFAULT_TRANSCRIPTION_MODEL
    const provider: TranscriptionProviderWithExtraOptions<string, VoiceboxTranscriptionOptions> = {
      transcription: (requestedModel, options) => ({
        ...options,
        baseURL: VOICEBOX_COMPATIBLE_BASE_URL,
        fetch: transcriptionFetch(config, requestedModel || model, options),
        model: requestedModel || model,
      }),
    }
    return provider
  },
  extraMethods: {
    listModels: async (config) => {
      const response = await requestVoicebox(config.baseUrl, '/models/status', { method: 'GET' }).then(responseJson<VoiceboxModelStatusResponse>)
      return response.models
        .filter(model => model.model_name.startsWith('whisper-'))
        .map(model => ({
          id: transcriptionModel(model.model_name),
          name: model.display_name,
          provider: VOICEBOX_TRANSCRIPTION_PROVIDER_ID,
          description: model.downloaded ? 'Ready' : model.downloading ? 'Downloading' : 'Downloads on first use',
        }))
    },
  },
  capabilities: {
    transcription: {
      generateOutput: true,
      protocol: 'http',
      streamInput: false,
      streamOutput: false,
    },
  },
  validationRequiredWhen: () => true,
  validators: {
    validateConfig: [configValidator<VoiceboxTranscriptionConfig>],
    validateProvider: [healthValidator<VoiceboxTranscriptionConfig>],
  },
})
