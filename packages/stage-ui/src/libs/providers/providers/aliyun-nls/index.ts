import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { AliyunRealtimeSpeechExtraOptions } from '../../../../stores/providers/aliyun/stream-transcription'

import { z } from 'zod'

import { createAliyunNLSProvider } from '../../../../stores/providers/aliyun/stream-transcription'
import { defineProvider } from '../registry'

const aliyunNlsRegions = [
  'cn-shanghai',
  'cn-shanghai-internal',
  'cn-beijing',
  'cn-beijing-internal',
  'cn-shenzhen',
  'cn-shenzhen-internal',
] as const

const aliyunNlsConfigSchema = z.object({
  accessKeyId: z.string(),
  accessKeySecret: z.string(),
  appKey: z.string(),
  region: z.enum(aliyunNlsRegions).default('cn-shanghai'),
})

type AliyunNlsConfig = z.input<typeof aliyunNlsConfigSchema>

export const providerAliyunNlsTranscription = defineProvider<AliyunNlsConfig>({
  id: 'aliyun-nls-transcription',
  name: 'Aliyun NLS',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.aliyun-nls.title'),
  description: 'nls-console.aliyun.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.aliyun-nls.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
  icon: 'i-lobe-icons:alibabacloud',
  capabilities: {
    transcription: {
      protocol: 'websocket',
      generateOutput: false,
      streamOutput: true,
      streamInput: true,
    },
  },
  createProviderConfig: () => aliyunNlsConfigSchema,
  createProvider(config) {
    const accessKeyId = config.accessKeyId.trim()
    const accessKeySecret = config.accessKeySecret.trim()
    const appKey = config.appKey.trim()
    if (!accessKeyId || !accessKeySecret || !appKey)
      throw new Error('Aliyun NLS credentials are incomplete.')

    const provider = createAliyunNLSProvider(accessKeyId, accessKeySecret, appKey, {
      region: config.region ?? 'cn-shanghai',
    })

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
    } as TranscriptionProviderWithExtraOptions<string, AliyunRealtimeSpeechExtraOptions>
  },
  validationRequiredWhen: config => Boolean(config.accessKeyId?.trim() && config.accessKeySecret?.trim() && config.appKey?.trim()),
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'aliyun-nls:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          if (!config.accessKeyId?.trim())
            errors.push({ error: new Error('Access Key ID is required.') })
          if (!config.accessKeySecret?.trim())
            errors.push({ error: new Error('Access Key Secret is required.') })
          if (!config.appKey?.trim())
            errors.push({ error: new Error('App Key is required.') })
          if (config.region && !aliyunNlsRegions.includes(config.region))
            errors.push({ error: new Error('Region is invalid.') })

          return {
            errors,
            reason: errors.map(item => (item.error as Error).message).join(', '),
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  },
  extraMethods: {
    listModels: async () => [{
      id: 'aliyun-nls-v1',
      name: 'Aliyun NLS Realtime',
      provider: 'aliyun-nls-transcription',
      description: 'Realtime streaming transcription using Aliyun NLS.',
      contextLength: 0,
      deprecated: false,
    }],
  },
})
