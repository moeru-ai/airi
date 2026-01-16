import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type {
  BaseSpeechProviderConfig,
  BaseSpeechProviderDefinition,
} from '../../libs/providers/base-speech'
import type {
  BaseTranscriptionProviderConfig,
  BaseTranscriptionProviderDefinition,
} from '../../libs/providers/base-transcription'
import type { ProviderMetadata } from '../providers'

/**
 * Convert BaseSpeechProviderDefinition to ProviderMetadata
 *
 * This allows base provider implementations to be used with the existing
 * ProviderMetadata-based store system.
 */
export function convertSpeechProviderToMetadata(
  definition: BaseSpeechProviderDefinition,
  metadata: Pick<ProviderMetadata, 'nameKey' | 'name' | 'descriptionKey' | 'description' | 'icon' | 'order' | 'iconColor' | 'iconImage' | 'isAvailableBy'>,
): ProviderMetadata {
  return {
    id: definition.id,
    category: 'speech',
    tasks: ['text-to-speech'],
    ...metadata,
    defaultOptions: () => definition.getDefaultConfig?.() || {},
    createProvider: async (config: Record<string, unknown>) => {
      const result = await definition.createProvider(config as BaseSpeechProviderConfig)
      return result as SpeechProvider | SpeechProviderWithExtraOptions
    },
    capabilities: {
      listModels: definition.listModels ? (config: Record<string, unknown>) => definition.listModels!(config as BaseSpeechProviderConfig) : undefined,
      listVoices: definition.listVoices ? (config: Record<string, unknown>) => definition.listVoices!(config as BaseSpeechProviderConfig) : undefined,
    },
    validators: {
      validateProviderConfig: (config: Record<string, unknown>) => {
        return definition.validateConfig(config as BaseSpeechProviderConfig)
      },
    },
  }
}

/**
 * Convert BaseTranscriptionProviderDefinition to ProviderMetadata
 *
 * This allows base provider implementations to be used with the existing
 * ProviderMetadata-based store system.
 */
export function convertTranscriptionProviderToMetadata(
  definition: BaseTranscriptionProviderDefinition,
  metadata: Pick<ProviderMetadata, 'nameKey' | 'name' | 'descriptionKey' | 'description' | 'icon' | 'order' | 'iconColor' | 'iconImage' | 'isAvailableBy'>,
): ProviderMetadata {
  return {
    id: definition.id,
    category: 'transcription',
    tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
    ...metadata,
    defaultOptions: () => definition.getDefaultConfig?.() || {},
    createProvider: async (config: Record<string, unknown>) => {
      const result = await definition.createProvider(config as BaseTranscriptionProviderConfig)
      return result as TranscriptionProvider | TranscriptionProviderWithExtraOptions
    },
    capabilities: {
      listModels: definition.listModels ? (config: Record<string, unknown>) => definition.listModels!(config as BaseTranscriptionProviderConfig) : undefined,
    },
    validators: {
      validateProviderConfig: (config: Record<string, unknown>) => {
        return definition.validateConfig(config as BaseTranscriptionProviderConfig)
      },
    },
    transcriptionFeatures: definition.transcriptionFeatures,
  }
}
