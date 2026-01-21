import type {
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { ComposerTranslation } from 'vue-i18n'

import type { ModelInfo } from '../../../../stores/providers'
import type { AliyunRealtimeSpeechExtraOptions } from '../../../../stores/providers/aliyun/stream-transcription'
import type { ProviderValidationResult } from '../../../base-types'

import { z } from 'zod'

import { createAliyunNLSProvider as createAliyunNlsStreamProvider } from '../../../../stores/providers/aliyun/stream-transcription'
import { defineProvider } from '../registry'

const ALIYUN_NLS_REGIONS = [
  'cn-shanghai',
  'cn-shanghai-internal',
  'cn-beijing',
  'cn-beijing-internal',
  'cn-shenzhen',
  'cn-shenzhen-internal',
] as const

type AliyunNlsRegion = typeof ALIYUN_NLS_REGIONS[number]

const aliyunNlsConfigSchema = z.object({
  accessKeyId: z.string('Access Key ID'),
  accessKeySecret: z.string('Access Key Secret'),
  appKey: z.string('App Key'),
  region: z.enum(ALIYUN_NLS_REGIONS as [string, ...string[]], {
    errorMap: () => ({ message: 'Region is invalid.' }),
  }).optional().default('cn-shanghai'),
})

type AliyunNlsConfig = z.input<typeof aliyunNlsConfigSchema>

/**
 * Aliyun NLS Transcription/STT Provider Implementation
 *
 * Uses the unified defineProvider pattern for Aliyun NLS realtime streaming transcription API.
 */
export const providerAliyunNlsTranscription = defineProvider<AliyunNlsConfig>({
  id: 'aliyun-nls-transcription',
  order: 2,
  name: 'Aliyun NLS',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.aliyun-nls.title'),
  description: 'nls-console.aliyun.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.aliyun-nls.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
  icon: 'i-lobe-icons:alibabacloud',

  createProviderConfig: ({ t }) => aliyunNlsConfigSchema.extend({
    accessKeyId: aliyunNlsConfigSchema.shape.accessKeyId.meta({
      labelLocalized: t('settings.pages.providers.provider.aliyun-nls.config.access-key-id.label'),
      descriptionLocalized: t('settings.pages.providers.provider.aliyun-nls.config.access-key-id.description'),
      placeholderLocalized: t('settings.pages.providers.provider.aliyun-nls.config.access-key-id.placeholder'),
      type: 'password',
    }),
    accessKeySecret: aliyunNlsConfigSchema.shape.accessKeySecret.meta({
      labelLocalized: t('settings.pages.providers.provider.aliyun-nls.config.access-key-secret.label'),
      descriptionLocalized: t('settings.pages.providers.provider.aliyun-nls.config.access-key-secret.description'),
      placeholderLocalized: t('settings.pages.providers.provider.aliyun-nls.config.access-key-secret.placeholder'),
      type: 'password',
    }),
    appKey: aliyunNlsConfigSchema.shape.appKey.meta({
      labelLocalized: t('settings.pages.providers.provider.aliyun-nls.config.app-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.aliyun-nls.config.app-key.description'),
      placeholderLocalized: t('settings.pages.providers.provider.aliyun-nls.config.app-key.placeholder'),
      type: 'password',
    }),
    region: aliyunNlsConfigSchema.shape.region.meta({
      labelLocalized: t('settings.pages.providers.provider.aliyun-nls.config.region.label'),
      descriptionLocalized: t('settings.pages.providers.provider.aliyun-nls.config.region.description'),
    }),
  }),

  createProvider(config) {
    const toString = (value: unknown) => typeof value === 'string' ? value.trim() : ''

    const accessKeyId = toString(config.accessKeyId)
    const accessKeySecret = toString(config.accessKeySecret)
    const appKey = toString(config.appKey)
    const region = toString(config.region)
    const resolvedRegion = ALIYUN_NLS_REGIONS.includes(region as AliyunNlsRegion) ? region as AliyunNlsRegion : 'cn-shanghai'

    if (!accessKeyId || !accessKeySecret || !appKey)
      throw new Error('Aliyun NLS credentials are incomplete.')

    const provider = createAliyunNlsStreamProvider(accessKeyId, accessKeySecret, appKey, { region: resolvedRegion })

    return {
      transcription: (model: string, extraOptions?: AliyunRealtimeSpeechExtraOptions) => provider.speech(model, {
        ...extraOptions,
        sessionOptions: {
          format: 'pcm',
          sample_rate: 16000,
          enable_punctuation_prediction: true,
          enable_intermediate_result: true,
          enable_words: true,
          ...extraOptions?.sessionOptions,
        },
      }),
    } as TranscriptionProvider | TranscriptionProviderWithExtraOptions<string, AliyunRealtimeSpeechExtraOptions>
  },

  validationRequiredWhen(config) {
    const toString = (value: unknown) => typeof value === 'string' ? value.trim() : ''
    const accessKeyId = toString(config.accessKeyId)
    const accessKeySecret = toString(config.accessKeySecret)
    const appKey = toString(config.appKey)
    return !!(accessKeyId && accessKeySecret && appKey)
  },

  validators: {
    validateConfig: [
      ({ t }: { t: ComposerTranslation }) => ({
        id: 'aliyun-nls-transcription:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.aliyun-nls-transcription.check-config.title'),
        validator: async (config: AliyunNlsConfig): Promise<ProviderValidationResult> => {
          const errors: Error[] = []
          const toString = (value: unknown) => typeof value === 'string' ? value.trim() : ''

          const accessKeyId = toString(config.accessKeyId)
          const accessKeySecret = toString(config.accessKeySecret)
          const appKey = toString(config.appKey)
          const region = toString(config.region)

          if (!accessKeyId)
            errors.push(new Error('Access Key ID is required.'))
          if (!accessKeySecret)
            errors.push(new Error('Access Key Secret is required.'))
          if (!appKey)
            errors.push(new Error('App Key is required.'))
          if (region && !ALIYUN_NLS_REGIONS.includes(region as AliyunNlsRegion))
            errors.push(new Error('Region is invalid.'))

          return {
            errors,
            reason: errors.length > 0 ? errors.map(error => error.message).join(', ') : '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },

  capabilities: {
    transcription: {
      protocol: 'websocket',
      generateOutput: false,
      streamOutput: true,
      streamInput: true,
    },
  },

  extraMethods: {
    async listModels(_config): Promise<ModelInfo[]> {
      return [
        {
          id: 'aliyun-nls-v1',
          name: 'Aliyun NLS Realtime',
          provider: 'aliyun-nls-transcription',
          description: 'Realtime streaming transcription using Aliyun NLS.',
          contextLength: 0,
          deprecated: false,
        },
      ]
    },
  },
})

// Keep export for backward compatibility during migration
export const aliyunNlsTranscriptionProvider = providerAliyunNlsTranscription
