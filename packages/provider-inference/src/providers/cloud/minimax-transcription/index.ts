import { createModelProvider, merge } from '@xsai-ext/providers/utils'
import { z } from 'zod'

import { defineProvider } from '../../registry'

const minimaxTranscriptionConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default('https://api.minimax.io/v1/'),
  // An empty language enables mixed-language recognition, which the API
  // documents as the default.
  language: z.string().default(''),
})

type MinimaxTranscriptionConfig = z.input<typeof minimaxTranscriptionConfigSchema>

/** The only model version the MiniMax ASR API accepts today. */
const MINIMAX_ASR_MODEL = 'asr-1.0'

interface MinimaxAsrResponse {
  text?: string
}

/**
 * The MiniMax ASR API uses `POST /v1/speech_to_text` and takes the language as
 * a request header. The shared transcription helper targets the OpenAI route
 * and sends the language as a form field, so this adapter rewrites both.
 */
function createMinimaxAsrFetch(config: MinimaxTranscriptionConfig): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input as RequestInfo, init)
    const baseUrl = (config.baseUrl || 'https://api.minimax.io/v1/').replace(/\/$/, '')
    const source = await request.formData()
    const body = new FormData()

    body.append('model', source.get('model')?.toString() || MINIMAX_ASR_MODEL)
    const file = source.get('file')
    if (file)
      body.append('file', file)

    const responseFormat = source.get('response_format')?.toString()
    if (responseFormat)
      body.append('response_format', responseFormat)

    // `timestamp_granularities[]` has no MiniMax equivalent. Dropping it keeps
    // a `verbose_json` request valid instead of failing on an unknown field.
    const language = config.language?.trim() || source.get('language')?.toString()?.trim()
    const headers = new Headers(request.headers)
    if (language)
      headers.set('language', language)
    else
      headers.delete('language')

    return await globalThis.fetch(`${baseUrl}/speech_to_text`, {
      body,
      headers,
      method: 'POST',
      signal: request.signal,
    })
  }
}

export const providerMinimaxTranscription = defineProvider<MinimaxTranscriptionConfig, 'minimax-transcription'>({
  id: 'minimax-transcription',
  name: 'MiniMax Transcription',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.minimax-transcription.title'),
  description: 'minimax.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.minimax-transcription.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-solar:user-speak-rounded-duotone',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },

  createProviderConfig: ({ t }) => minimaxTranscriptionConfigSchema.extend({
    apiKey: minimaxTranscriptionConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: minimaxTranscriptionConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
    language: minimaxTranscriptionConfigSchema.shape.language.meta({
      labelLocalized: t('settings.pages.providers.provider.minimax-transcription.fields.field.language.label'),
      descriptionLocalized: t('settings.pages.providers.provider.minimax-transcription.fields.field.language.description'),
      placeholderLocalized: t('settings.pages.providers.provider.minimax-transcription.fields.field.language.placeholder'),
    }),
  }),

  createProvider(config) {
    return merge(
      createModelProvider({ apiKey: config.apiKey, baseURL: config.baseUrl! }),
      {
        transcription: (model: string, extraOptions?: Record<string, unknown>) => ({
          apiKey: config.apiKey,
          baseURL: config.baseUrl!,
          model,
          fetch: createMinimaxAsrFetch(config),
          ...extraOptions,
        }),
      },
    )
  },

  validationRequiredWhen: config => Boolean(config.apiKey?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'minimax-transcription:check-config',
        name: t('settings.pages.providers.provider.minimax-transcription.title'),
        validator: async (config) => {
          const valid = Boolean(config.apiKey?.trim())
          return {
            errors: valid ? [] : [{ error: new Error('API key is required.') }],
            reason: valid ? '' : 'API key is required.',
            reasonKey: '',
            valid,
          }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async (): Promise<{ id: string, name: string, provider: string, description?: string }[]> => [
      {
        id: MINIMAX_ASR_MODEL,
        name: 'Speech 2.8 ASR',
        provider: 'minimax-transcription',
        description: 'Speech-to-text model for live transcription',
      },
    ],
  },
})

/** Reads the recognized text from a MiniMax ASR payload. */
export function readMinimaxAsrText(payload: MinimaxAsrResponse): string {
  return payload.text ?? ''
}
