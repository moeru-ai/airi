import type {
  SpeechProvider,
} from '@xsai-ext/providers/utils'
import type { ComposerTranslation } from 'vue-i18n'

import type { VoiceInfo } from '../../../../stores/providers'
import type { ProviderValidationResult } from '../../types'

import { isUrl } from '@proj-airi/stage-shared'
import { z } from 'zod'

import { normalizeBaseUrl } from '../../utils'
import { defineProvider } from '../registry'

const indexTTSConfigSchema = z.object({
  baseUrl: z.string('Base URL').optional().default('http://localhost:11996/tts/'),
})

type IndexTTSConfig = z.input<typeof indexTTSConfigSchema>

/**
 * Index-TTS by Bilibili Speech/TTS Provider Implementation
 *
 * Uses the unified defineProvider pattern for Index-TTS vLLM text-to-speech API.
 */
export const providerIndexTTSSpeech = defineProvider<IndexTTSConfig>({
  id: 'index-tts-vllm',
  order: 6,
  name: 'Index-TTS by Bilibili',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.index-tts-vllm.title'),
  description: 'index-tts.github.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.index-tts-vllm.description'),
  tasks: ['text-to-speech'],
  iconColor: 'i-lobe-icons:bilibiliindex',

  createProviderConfig: ({ t }) => indexTTSConfigSchema.extend({
    baseUrl: indexTTSConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  createProvider(config) {
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    const provider: SpeechProvider = {
      speech: () => {
        const req = {
          baseURL: baseUrl,
          model: 'IndexTTS-1.5',
        }
        return req
      },
    }
    return provider
  },

  validationRequiredWhen(config) {
    return !!config.baseUrl?.trim()
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'index-tts-vllm:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.index-tts-vllm.check-config.title'),
        validator: async (config: IndexTTSConfig, _contextOptions: { t: ComposerTranslation }): Promise<ProviderValidationResult> => {
          const errors: Array<{ error: unknown, errorKey?: string }> = []
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!baseUrl)
            errors.push({ error: new Error('Base URL is required. Default to http://localhost:11996/tts/ for Index-TTS.') })

          if (baseUrl) {
            if (!isUrl(baseUrl) || new URL(baseUrl).host.length === 0) {
              errors.push({ error: new Error('Base URL is not absolute. Try to include a scheme (http:// or https://).') })
            }
            else if (!baseUrl.endsWith('/')) {
              errors.push({ error: new Error('Base URL must end with a trailing slash (/).') })
            }
          }

          const reason = errors.length > 0 ? errors.map(e => e.error instanceof Error ? e.error.message : String(e.error)).join(', ') : ''

          return {
            errors,
            reason,
            reasonKey: errors.length > 0 ? 'index-tts-vllm:check-config:invalid' : '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },

  extraMethods: {
    async listVoices(config, _provider): Promise<VoiceInfo[]> {
      const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
      const voicesUrl = baseUrl || 'http://localhost:11996/tts/'
      const response = await fetch(`${voicesUrl}audio/voices`)
      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.statusText}`)
      }
      const voices = await response.json()
      return Object.keys(voices).map((voice: any) => {
        return {
          id: voice,
          name: voice,
          provider: 'index-tts-vllm',
          // previewURL: voice.preview_audio_url,
          languages: [{ code: 'cn', title: 'Chinese' }, { code: 'en', title: 'English' }],
        }
      })
    },
  },
})

// Keep export for backward compatibility during migration
export const indexTTSSpeechProvider = providerIndexTTSSpeech
