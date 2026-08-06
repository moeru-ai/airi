import type { ModelInfo, ProviderMetadata } from '../providers'

import { createOpenAI } from '@xsai-ext/providers/create'

import { buildOpenAICompatibleProvider } from './openai-compatible-builder'

type FunASRProviderCreator = Parameters<typeof buildOpenAICompatibleProvider>[0]['creator']

/** Fixed model choices exposed by the FunASR transcription provider. */
export const FUNASR_TRANSCRIPTION_MODELS = [
  {
    id: 'sensevoice',
    name: 'SenseVoice',
    provider: 'funasr-audio-transcription',
    description: 'Multilingual speech recognition with emotion and audio event detection.',
    contextLength: 0,
    deprecated: false,
  },
  {
    id: 'fun-asr-nano',
    name: 'Fun-ASR-Nano',
    provider: 'funasr-audio-transcription',
    description: 'End-to-end multilingual speech recognition model.',
    contextLength: 0,
    deprecated: false,
  },
  {
    id: 'paraformer',
    name: 'Paraformer',
    provider: 'funasr-audio-transcription',
    description: 'Fast non-autoregressive speech recognition model.',
    contextLength: 0,
    deprecated: false,
  },
] satisfies ModelInfo[]

function validateFunASRConfig(config: Record<string, unknown>) {
  const errors: Error[] = []
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
  const model = typeof config.model === 'string' ? config.model.trim() : ''

  if (!baseUrl) {
    errors.push(new Error('Base URL is required'))
  }
  else {
    try {
      const url = new URL(baseUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        errors.push(new Error('Base URL must use http:// or https://'))
    }
    catch {
      errors.push(new Error('Base URL must be an absolute URL'))
    }
  }

  if (!model)
    errors.push(new Error('Model is required'))

  return {
    errors,
    reason: errors.map(error => error.message).join(', '),
    valid: errors.length === 0,
  }
}

/** Builds the credential-optional, OpenAI-compatible FunASR transcription provider. */
export function buildFunASRProvider(
  creator: FunASRProviderCreator = createOpenAI,
): ProviderMetadata {
  return buildOpenAICompatibleProvider({
    id: 'funasr-audio-transcription',
    name: 'FunASR',
    nameKey: 'settings.pages.providers.provider.funasr.title',
    descriptionKey: 'settings.pages.providers.provider.funasr.description',
    icon: 'i-lobe-icons:modelscope',
    description: 'Local speech recognition with FunASR, SenseVoice, and Fun-ASR-Nano.',
    category: 'transcription',
    tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
    creator,
    requiresCredentials: false,
    defaultOptions: () => ({
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    }),
    capabilities: {
      listModels: async () => FUNASR_TRANSCRIPTION_MODELS.map(model => ({ ...model })),
    },
    validators: {
      chatPingCheckAvailable: false,
      validateProviderConfig: async config => validateFunASRConfig(config),
    },
  })
}
