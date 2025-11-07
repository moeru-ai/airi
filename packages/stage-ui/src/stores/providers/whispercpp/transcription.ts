import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/shared-providers'

const DEFAULT_RESPONSE_FORMAT: WhisperCppResponseFormat = 'json'
const DEFAULT_INFERENCE_PATH = 'inference'

export type WhisperCppResponseFormat = 'json' | 'verbose_json' | 'text' | 'srt' | 'vtt'

export interface WhisperCppTranscriptionConfig {
  baseUrl: string
  requestPath?: string
  inferencePath?: string
  responseFormat?: WhisperCppResponseFormat
  language?: string
  prompt?: string
  temperature?: number
  temperatureIncrement?: number
  translate?: boolean
  detectLanguage?: boolean
  diarize?: boolean
  tinydiarize?: boolean
  splitOnWord?: boolean
  suppressNonSpeechTokens?: boolean
  noTimestamps?: boolean
}

export type WhisperCppTranscriptionExtraOptions = Partial<Omit<WhisperCppTranscriptionConfig, 'baseUrl'>> & {
  requestPath?: string
  inferencePath?: string
}

type WhisperCppFormOverrides = Record<string, string | undefined>

export function createWhisperCppTranscriptionProvider(config: WhisperCppTranscriptionConfig): TranscriptionProviderWithExtraOptions<string, WhisperCppTranscriptionExtraOptions> {
  const normalizedBaseUrl = normalizeBaseUrl(config.baseUrl)
  const defaultRequestPath = sanitizePath(config.requestPath)
  const defaultInferencePath = sanitizePath(config.inferencePath) || DEFAULT_INFERENCE_PATH

  function buildEndpoint(requestPath?: string, inferencePath?: string) {
    const segments = [
      sanitizePath(requestPath ?? defaultRequestPath),
      sanitizePath(inferencePath ?? defaultInferencePath) || DEFAULT_INFERENCE_PATH,
    ].filter(Boolean)

    const relativePath = segments.join('/')
    return new URL(relativePath || '', normalizedBaseUrl).toString()
  }

  function createProxyFetch(extras: WhisperCppTranscriptionExtraOptions) {
    const endpoint = buildEndpoint(extras.requestPath, extras.inferencePath)
    const overrides = resolveFormOverrides(config, extras)

    return async (_input: RequestInfo | URL, init?: RequestInit) => {
      const nextInit: RequestInit = {
        ...init,
      }

      if (nextInit.body instanceof FormData) {
        patchFormData(nextInit.body, overrides)
      }

      return fetch(endpoint, nextInit)
    }
  }

  return {
    transcription(model, extraOptions) {
      const responseFormat = extraOptions?.responseFormat ?? config.responseFormat ?? DEFAULT_RESPONSE_FORMAT

      return {
        baseURL: normalizedBaseUrl,
        model,
        responseFormat,
        language: extraOptions?.language ?? config.language,
        prompt: extraOptions?.prompt ?? config.prompt,
        temperature: extraOptions?.temperature ?? config.temperature,
        fetch: createProxyFetch(extraOptions ?? {}),
      }
    },
  }
}

function normalizeBaseUrl(value: string) {
  const trimmed = (value || '').trim()
  if (!trimmed)
    throw new Error('Base URL is required to create a whisper.cpp provider.')
  const normalized = trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  return new URL(normalized).toString()
}

function sanitizePath(value?: string) {
  if (!value)
    return ''
  return value
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function patchFormData(formData: FormData, overrides: WhisperCppFormOverrides) {
  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined)
      formData.set(key, value)
  })
}

function resolveFormOverrides(
  base: WhisperCppTranscriptionConfig,
  extras: WhisperCppTranscriptionExtraOptions,
): WhisperCppFormOverrides {
  return {
    temperature_inc: resolveNumber(extras.temperatureIncrement, base.temperatureIncrement),
    translate: resolveBoolean(extras.translate, base.translate),
    detect_language: resolveBoolean(extras.detectLanguage, base.detectLanguage),
    diarize: resolveBoolean(extras.diarize, base.diarize),
    tinydiarize: resolveBoolean(extras.tinydiarize, base.tinydiarize),
    split_on_word: resolveBoolean(extras.splitOnWord, base.splitOnWord),
    suppress_nst: resolveBoolean(extras.suppressNonSpeechTokens, base.suppressNonSpeechTokens),
    no_timestamps: resolveBoolean(extras.noTimestamps, base.noTimestamps),
  }
}

function resolveBoolean(value?: boolean, fallback?: boolean) {
  const finalValue = value ?? fallback
  return finalValue === undefined ? undefined : finalValue ? 'true' : 'false'
}

function resolveNumber(value?: number, fallback?: number) {
  const finalValue = value ?? fallback
  return finalValue === undefined || Number.isNaN(finalValue) ? undefined : String(finalValue)
}
