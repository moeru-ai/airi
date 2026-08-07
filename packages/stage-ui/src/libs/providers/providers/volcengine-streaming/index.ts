import type { ModelInfo, VoiceInfo } from '../../types'

import { createUnVolcengine } from 'unspeech'
import { z } from 'zod'

import { getAuthToken } from '../../../auth'
import { SERVER_URL } from '../../../server'
import { defineProvider } from '../registry'

export const VOLCENGINE_STREAMING_PROVIDER_ID = 'volcengine-streaming'

const configSchema = z.object({
  apiKey: z.string(),
})

type VolcengineStreamingConfig = z.input<typeof configSchema>

let defaultModelId: string | null = null

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getAuthToken()
  if (token)
    headers.Authorization = `Bearer ${token}`
  return headers
}

export function getVolcengineStreamingDefaultModel(): string | null {
  return defaultModelId
}

export const providerVolcengineStreaming = defineProvider<VolcengineStreamingConfig>({
  id: VOLCENGINE_STREAMING_PROVIDER_ID,
  order: 31,
  name: 'Volcengine Streaming TTS',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine-streaming.title'),
  description: 'Low-latency Volcengine TTS through the AIRI UnSpeech bridge.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.volcengine-streaming.description'),
  tasks: ['text-to-speech'],
  iconColor: 'i-lobe-icons:volcengine',
  createProviderConfig: ({ t }) => configSchema.extend({
    apiKey: configSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.volcengine-streaming.fields.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.provider.volcengine-streaming.fields.api-key.placeholder'),
      type: 'password',
    }),
  }),
  createProvider(config) {
    // The provider instance satisfies the shared speech-provider boundary.
    // Runtime synthesis uses the bidirectional session capability below, not
    // this REST-compatible instance.
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    return createUnVolcengine(apiKey, 'https://unspeech.hyp3r.link/v1/')
  },
  capabilities: {
    speech: {
      transport: 'bidirectional-ws',
      resolveConnection: (config) => {
        const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
        return {
          credentialMode: 'byok',
          providerId: VOLCENGINE_STREAMING_PROVIDER_ID,
          apiKey,
        }
      },
      getDefaultModel: getVolcengineStreamingDefaultModel,
    },
  },
  validationRequiredWhen: () => true,
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'volcengine-streaming:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const valid = apiKey.length > 0
          return {
            errors: valid ? [] : [{ error: new Error('X-Api-Key is required.') }],
            reason: valid ? '' : 'X-Api-Key is required.',
            reasonKey: '',
            valid,
          }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async (): Promise<ModelInfo[]> => {
      defaultModelId = null
      const response = await globalThis.fetch(`${SERVER_URL}/api/v1/audio/models/streaming`, { headers: authHeaders() })
      if (!response.ok)
        throw new Error(`streaming models upstream ${response.status}: ${await response.text().catch(() => '')}`.slice(0, 256))

      const data = await response.json() as {
        models?: { id: string, name?: string, description?: string }[]
        default?: string | null
      }
      if (!Array.isArray(data.models))
        throw new Error('streaming models upstream missing models[]')

      defaultModelId = typeof data.default === 'string' && data.default.length > 0 ? data.default : null
      return data.models.map(model => ({
        id: model.id,
        name: model.name ?? model.id,
        provider: VOLCENGINE_STREAMING_PROVIDER_ID,
        description: model.description,
      }))
    },
    listVoices: async (_config, _provider, model): Promise<VoiceInfo[]> => {
      const resourceId = model?.includes('/') ? model.split('/', 2)[1] : model
      const url = new URL(`${SERVER_URL}/api/v1/audio/voices/streaming`)
      if (resourceId)
        url.searchParams.set('model', resourceId)

      const response = await globalThis.fetch(url, { headers: authHeaders() })
      if (!response.ok)
        throw new Error(`streaming voices upstream ${response.status}: ${await response.text().catch(() => '')}`.slice(0, 256))

      const data = await response.json() as {
        voices?: {
          id: string
          name: string
          description?: string
          labels?: Record<string, unknown>
          languages?: { code: string, title: string }[]
          preview_audio_url?: string
        }[]
      }
      if (!Array.isArray(data.voices))
        throw new Error('streaming voices upstream returned malformed body')

      return data.voices.map((voice) => {
        const gender = typeof voice.labels?.gender === 'string' ? voice.labels.gender.toLowerCase() : undefined
        return {
          id: voice.id,
          name: voice.name,
          provider: VOLCENGINE_STREAMING_PROVIDER_ID,
          description: voice.description,
          gender,
          previewURL: voice.preview_audio_url,
          languages: Array.isArray(voice.languages) ? voice.languages : [],
        }
      })
    },
  },
})
