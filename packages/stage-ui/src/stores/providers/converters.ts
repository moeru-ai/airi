import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type {
  BaseSpeechProviderDefinition,
} from '../../libs/providers/base-speech'
import type {
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
      const result = await definition.createProvider(config as any)
      return result as SpeechProvider | SpeechProviderWithExtraOptions
    },
    capabilities: {
      listModels: definition.listModels ? async (config: Record<string, unknown>) => await definition.listModels!(config as any) : undefined,
      listVoices: definition.listVoices ? async (config: Record<string, unknown>) => await definition.listVoices!(config as any) : undefined,
    },
    validators: {
      validateProviderConfig: async (config: Record<string, unknown>) => {
        return await definition.validateConfig(config as any)
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
      const result = await definition.createProvider(config as any)
      return result as TranscriptionProvider | TranscriptionProviderWithExtraOptions
    },
    capabilities: {
      listModels: definition.listModels ? async (config: Record<string, unknown>) => await definition.listModels!(config as any) : undefined,
    },
    validators: {
      validateProviderConfig: async (config: Record<string, unknown>) => {
        return await definition.validateConfig(config as any)
      },
    },
    transcriptionFeatures: definition.transcriptionFeatures,
  }
}
