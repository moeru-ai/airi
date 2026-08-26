import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../registry'

const indexTtsConfigSchema = z.object({
  baseUrl: z.string().default('http://localhost:11996/tts/'),
  model: z.string().default('IndexTTS-1.5'),
})

type IndexTtsConfig = z.input<typeof indexTtsConfigSchema>

function voicesUrl(config: IndexTtsConfig) {
  return `${config.baseUrl ?? 'http://localhost:11996/tts/'}audio/voices`
}

export const providerIndexTtsVllm = defineProvider<IndexTtsConfig>({
  id: 'index-tts-vllm',
  name: 'Index-TTS by Bilibili',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.index-tts-vllm.title'),
  description: 'index-tts.github.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.index-tts-vllm.description'),
  tasks: ['text-to-speech'],
  iconColor: 'i-lobe-icons:bilibiliindex',
  createProviderConfig: () => indexTtsConfigSchema,
  createProvider(config) {
    return {
      speech: () => ({
        baseURL: config.baseUrl ?? 'http://localhost:11996/tts/',
        model: config.model || 'IndexTTS-1.5',
      }),
    }
  },
  validationRequiredWhen: config => Boolean(config.baseUrl?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'index-tts-vllm:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const baseUrl = config.baseUrl?.trim() ?? ''
          if (!baseUrl) {
            const reason = 'Base URL is required. Default to http://localhost:11996/tts/ for Index-TTS.'
            return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
          }

          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)
          try {
            const response = await fetch(voicesUrl(config), { signal: controller.signal })
            if (!response.ok) {
              const reason = `IndexTTS unreachable: HTTP ${response.status} ${response.statusText}`
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
            }
          }
          catch (error) {
            const reason = `IndexTTS connection failed: ${errorMessageFrom(error) ?? 'Unknown error'}`
            return { errors: [{ error }], reason, reasonKey: '', valid: false }
          }
          finally {
            clearTimeout(timeout)
          }

          return { errors: [], reason: '', reasonKey: '', valid: true }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async () => [{
      id: 'IndexTTS-1.5',
      name: 'IndexTTS-1.5',
      provider: 'index-tts-vllm',
      description: 'Default model for Index-TTS vLLM deployment',
      contextLength: 0,
      deprecated: false,
    }],
    listVoices: async (config) => {
      const response = await fetch(voicesUrl(config))
      if (!response.ok)
        throw new Error(`Failed to fetch voices: ${response.statusText}`)

      const voices = await response.json() as Record<string, unknown>
      return Object.keys(voices).map(voice => ({
        id: voice,
        name: voice,
        provider: 'index-tts-vllm',
        languages: [{ code: 'cn', title: 'Chinese' }, { code: 'en', title: 'English' }],
      }))
    },
  },
})
