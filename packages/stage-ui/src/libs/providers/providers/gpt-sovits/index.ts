import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../registry'

const TRAILING_SLASH_RE = /\/+$/

interface GptSovitsConfig {
  baseUrl: string
  refAudioPath: string
  promptText: string
  promptLang: string
  textLang: string
  gptWeightsPath: string
  sovitsWeightsPath: string
}

async function electronFetch(url: string, init?: RequestInit & { requestId?: string }): Promise<Response> {
  const electron = typeof window !== 'undefined' ? (window as Window & { electron?: { ipcRenderer?: { invoke: (channel: string, payload: unknown) => Promise<any> } } }).electron : undefined
  if (!electron?.ipcRenderer)
    return globalThis.fetch(url, init)

  const headers: Record<string, string> = {}
  if (init?.headers instanceof Headers) {
    init.headers.forEach((value, key) => {
      headers[key] = value
    })
  }
  else if (Array.isArray(init?.headers)) {
    for (const [key, value] of init.headers)
      headers[key] = value
  }
  else if (init?.headers) {
    Object.assign(headers, init.headers)
  }

  const requestId = init?.requestId ?? crypto.randomUUID()
  const cancel = () => {
    void electron.ipcRenderer?.invoke('airi:electron:fetch-cancel', requestId)
  }
  init?.signal?.addEventListener('abort', cancel, { once: true })
  const result = await electron.ipcRenderer.invoke('airi:electron:fetch', {
    url,
    method: init?.method ?? 'GET',
    headers: Object.keys(headers).length ? headers : undefined,
    body: typeof init?.body === 'string' ? init.body : undefined,
    requestId,
  }).finally(() => init?.signal?.removeEventListener('abort', cancel))
  const body = result.bodyBase64
    ? Uint8Array.from(atob(result.bodyBase64), char => char.charCodeAt(0))
    : result.body
  return new Response(body, { status: result.status, statusText: result.statusText, headers: result.headers })
}

export const providerGptSovits = defineProvider<GptSovitsConfig, 'gpt-sovits'>({
  id: 'gpt-sovits',
  name: 'GPT-SoVITS',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.gpt-sovits.title'),
  description: 'GPT-SoVITS voice cloning',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.gpt-sovits.description'),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:speaker',
  requiresCredentials: false,
  createProviderConfig: () => z.object({
    baseUrl: z.string().default('http://127.0.0.1:9880'),
    refAudioPath: z.string().default(''),
    promptText: z.string().default(''),
    promptLang: z.string().default('zh'),
    textLang: z.string().default('zh'),
    gptWeightsPath: z.string().default(''),
    sovitsWeightsPath: z.string().default(''),
  }),
  async createProvider(config) {
    const baseUrl = config.baseUrl.replace(TRAILING_SLASH_RE, '')
    const switchWeights = async (path: string, endpoint: string) => {
      const response = await electronFetch(`${baseUrl}/${endpoint}?weights_path=${encodeURIComponent(path)}`)
      if (!response.ok)
        throw new Error(`${endpoint} failed with HTTP ${response.status}`)
    }
    if (config.gptWeightsPath)
      await switchWeights(config.gptWeightsPath, 'set_gpt_weights')
    if (config.sovitsWeightsPath)
      await switchWeights(config.sovitsWeightsPath, 'set_sovits_weights')
    return { speech: () => ({
      baseURL: `${baseUrl}/`,
      model: 'gpt-sovits',
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { input?: string }
        return electronFetch(`${baseUrl}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: body.input ?? '', text_lang: config.textLang, ref_audio_path: config.refAudioPath, prompt_text: config.promptText, prompt_lang: config.promptLang, media_type: 'wav', streaming_mode: false }),
          signal: init?.signal,
        }).catch((error) => {
          throw new Error(errorMessageFrom(error) ?? 'GPT-SoVITS synthesis failed')
        })
      },
    }) }
  },
  validationRequiredWhen: () => true,
  validators: {
    validateConfig: [({ t }) => ({
      id: 'gpt-sovits:check-config',
      name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
      validator: async (config) => {
        const errors = []
        if (!config.baseUrl)
          errors.push({ error: new Error(t('settings.pages.providers.provider.gpt-sovits.validation.baseUrlRequired')) })
        if (!config.refAudioPath)
          errors.push({ error: new Error(t('settings.pages.providers.provider.gpt-sovits.validation.refAudioRequired')) })
        if (errors.length)
          return { errors, reason: errors.map(item => item.error.message).join(', '), reasonKey: '', valid: false }
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10_000)
          try {
            const response = await electronFetch(`${String(config.baseUrl).replace(TRAILING_SLASH_RE, '')}/`, { signal: controller.signal })
            return { errors: response.ok ? [] : [{ error: new Error(`HTTP ${response.status}`) }], reason: response.ok ? '' : `HTTP ${response.status}`, reasonKey: '', valid: response.ok }
          }
          finally {
            clearTimeout(timeout)
          }
        }
        catch (error) {
          return { errors: [{ error: error instanceof Error ? error : new Error(String(error)) }], reason: 'GPT-SoVITS is unreachable', reasonKey: '', valid: false }
        }
      },
    })],
  },
  extraMethods: {
    listModels: async () => [{ id: 'gpt-sovits', name: 'GPT-SoVITS', provider: 'gpt-sovits', description: 'GPT-SoVITS voice cloning model', contextLength: 0, deprecated: false }],
    listVoices: async (config) => {
      const languageTitles: Record<string, string> = { zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean', yue: 'Cantonese' }
      const selected = config.textLang in languageTitles ? config.textLang : 'zh'
      const languages = [selected, ...Object.keys(languageTitles).filter(code => code !== selected)].map(code => ({ code, title: languageTitles[code] }))
      return [{ id: 'default', name: 'Configured reference audio', provider: 'gpt-sovits', languages }]
    },
  },
})
