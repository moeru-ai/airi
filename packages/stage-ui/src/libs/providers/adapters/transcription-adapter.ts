import type {
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ProviderMetadata } from '../../../stores/providers'
import type {
  BaseTranscriptionProviderConfig,
  BaseTranscriptionProviderDefinition,
  TranscriptionFeatures,
} from '../base-transcription'

/**
 * Adapter to convert ProviderMetadata to BaseTranscriptionProviderDefinition
 *
 * This allows existing providers using ProviderMetadata to work with
 * the base transcription provider interface.
 *
 * @param metadata - Provider metadata from stores/providers
 * @param defaultModel - Default model for this provider
 * @param transcriptionFeatures - Transcription features supported
 * @returns Base transcription provider definition
 */
export function createTranscriptionProviderAdapter(
  metadata: ProviderMetadata,
  defaultModel: string,
  transcriptionFeatures: TranscriptionFeatures = {
    supportsGenerate: true,
    supportsStreamOutput: false,
    supportsStreamInput: false,
  },
): BaseTranscriptionProviderDefinition {
  return {
    id: metadata.id,
    defaultModel,
    transcriptionFeatures,

    async validateConfig(config: BaseTranscriptionProviderConfig) {
      if (!metadata.validators?.validateProviderConfig) {
        return {
          errors: [],
          reason: '',
          valid: true,
        }
      }
      return await metadata.validators.validateProviderConfig(config)
    },

    async createProvider(config: BaseTranscriptionProviderConfig) {
      const result = await metadata.createProvider(config)
      return result as TranscriptionProvider<string> | TranscriptionProviderWithExtraOptions<string, any>
    },

    async listModels(config: BaseTranscriptionProviderConfig) {
      if (!metadata.capabilities?.listModels) {
        return []
      }
      return await metadata.capabilities.listModels(config)
    },

    getDefaultConfig() {
      return metadata.defaultOptions?.() || {}
    },
  }
}
