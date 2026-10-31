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

async function electronFetch(url: string, init?: RequestInit): Promise<Response> {
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

  const result = await electron.ipcRenderer.invoke('airi:electron:fetch', {
    url,
    method: init?.method ?? 'GET',
    headers: Object.keys(headers).length ? headers : undefined,
    body: typeof init?.body === 'string' ? init.body : undefined,
  })
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
    if (config.gptWeightsPath)
      await electronFetch(`${baseUrl}/set_gpt_weights?weights_path=${encodeURIComponent(config.gptWeightsPath)}`).catch(() => {})
    if (config.sovitsWeightsPath)
      await electronFetch(`${baseUrl}/set_sovits_weights?weights_path=${encodeURIComponent(config.sovitsWeightsPath)}`).catch(() => {})
    return { speech: () => ({
      baseURL: `${baseUrl}/`,
      model: 'gpt-sovits',
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { input?: string }
        return electronFetch(`${baseUrl}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: body.input ?? '', text_lang: config.textLang, ref_audio_path: config.refAudioPath, prompt_text: config.promptText, prompt_lang: config.promptLang, media_type: 'wav', streaming_mode: false }),
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
          errors.push({ error: new Error('Base URL is required') })
        if (!config.refAudioPath)
          errors.push({ error: new Error('Reference audio path is required') })
        if (errors.length)
          return { errors, reason: errors.map(item => item.error.message).join(', '), reasonKey: '', valid: false }
        try {
          const response = await electronFetch(`${String(config.baseUrl).replace(TRAILING_SLASH_RE, '')}/set_gpt_weights`)
          return { errors: response.ok ? [] : [{ error: new Error(`HTTP ${response.status}`) }], reason: response.ok ? '' : `HTTP ${response.status}`, reasonKey: '', valid: response.ok }
        }
        catch (error) {
          return { errors: [{ error: error instanceof Error ? error : new Error(String(error)) }], reason: 'GPT-SoVITS is unreachable', reasonKey: '', valid: false }
        }
      },
    })],
  },
  extraMethods: {
    listModels: async () => [{ id: 'gpt-sovits', name: 'GPT-SoVITS', provider: 'gpt-sovits', description: 'GPT-SoVITS voice cloning model', contextLength: 0, deprecated: false }],
    listVoices: async () => [{ id: 'default', name: 'Configured reference audio', provider: 'gpt-sovits', languages: [{ code: 'zh', title: 'Chinese' }, { code: 'en', title: 'English' }, { code: 'ja', title: 'Japanese' }] }],
  },
})
