import type { TranslationLanguageInfo, TranslationProvider } from '../providers'

export const DEFAULT_LIBRETRANSLATE_BASE_URL = 'http://127.0.0.1:5000/'

interface LibreTranslateConfig {
  baseUrl?: unknown
  apiKey?: unknown
}

interface LibreTranslateTranslateParams {
  text: string
  source?: string
  target: string
  format?: 'text' | 'html'
}

interface LibreTranslateTranslateResponse {
  translatedText?: string
  error?: string
}

interface LibreTranslateLanguageResponse {
  code: string
  name: string
}

function normalizeBaseUrl(baseUrl?: unknown) {
  const normalized = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  if (!normalized)
    return DEFAULT_LIBRETRANSLATE_BASE_URL
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

function normalizeApiKey(apiKey?: unknown) {
  return typeof apiKey === 'string' ? apiKey.trim() : ''
}

async function requestJson<T>(baseUrl: string, path: string, init: RequestInit = {}) {
  const url = new URL(path, baseUrl)
  const headers = new Headers(init.headers)
  if (!headers.has('Accept'))
    headers.set('Accept', 'application/json')
  if ((init.method ?? 'GET').toUpperCase() === 'POST' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `LibreTranslate request failed with status ${response.status}`)
  }

  return await response.json() as T
}

export function createLibreTranslateProvider(config: LibreTranslateConfig): TranslationProvider {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const apiKey = normalizeApiKey(config.apiKey)

  async function translate(params: LibreTranslateTranslateParams) {
    const payload: Record<string, unknown> = {
      q: params.text,
      source: params.source || 'auto',
      target: params.target,
      format: params.format || 'text',
    }

    if (apiKey)
      payload.api_key = apiKey

    const data = await requestJson<LibreTranslateTranslateResponse>(baseUrl, 'translate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (!data?.translatedText)
      throw new Error(data?.error || 'LibreTranslate returned an empty response')

    return data.translatedText
  }

  async function listLanguages() {
    const languages = await requestJson<LibreTranslateLanguageResponse[]>(baseUrl, 'languages')
    return languages.map(language => ({
      code: language.code,
      name: language.name || language.code,
    })) satisfies TranslationLanguageInfo[]
  }

  return {
    translate,
    listLanguages,
  }
}

export async function listLibreTranslateLanguages(config: LibreTranslateConfig) {
  const provider = createLibreTranslateProvider(config)
  return provider.listLanguages ? provider.listLanguages() : []
}

export async function verifyLibreTranslateConnection(config: LibreTranslateConfig) {
  const provider = createLibreTranslateProvider(config)
  const sampleText = 'Hello'
  await provider.translate({
    text: sampleText,
    source: 'auto',
    target: 'en',
    format: 'text',
  })
}
