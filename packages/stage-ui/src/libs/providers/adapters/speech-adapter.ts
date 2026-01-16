import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ProviderMetadata } from '../../../stores/providers'
import type {
  BaseSpeechProviderConfig,
  BaseSpeechProviderDefinition,
} from '../base-speech'

/**
 * Adapter to convert ProviderMetadata to BaseSpeechProviderDefinition
 *
 * This allows existing providers using ProviderMetadata to work with
 * the base speech provider interface.
 *
 * @param metadata - Provider metadata from stores/providers
 * @param defaultModel - Default model for this provider
 * @param defaultVoice - Default voice for this provider (optional)
 * @returns Base speech provider definition
 */
export function createSpeechProviderAdapter(
  metadata: ProviderMetadata,
  defaultModel: string,
  defaultVoice?: string,
): BaseSpeechProviderDefinition {
  return {
    id: metadata.id,
    defaultModel,
    defaultVoice,

    async validateConfig(config: BaseSpeechProviderConfig) {
      if (!metadata.validators?.validateProviderConfig) {
        return {
          errors: [],
          reason: '',
          valid: true,
        }
      }
      return await metadata.validators.validateProviderConfig(config)
    },

    async createProvider(config: BaseSpeechProviderConfig) {
      const result = await metadata.createProvider(config)
      return result as SpeechProvider<string> | SpeechProviderWithExtraOptions<string, any>
    },

    async listModels(config: BaseSpeechProviderConfig) {
      if (!metadata.capabilities?.listModels) {
        return []
      }
      return await metadata.capabilities.listModels(config)
    },

    async listVoices(config: BaseSpeechProviderConfig) {
      if (!metadata.capabilities?.listVoices) {
        return []
      }
      return await metadata.capabilities.listVoices(config)
    },

    getDefaultConfig() {
      return metadata.defaultOptions?.() || {}
    },

    supportsSSML() {
      // Check if provider supports SSML based on metadata or provider-specific logic
      // This can be extended based on provider-specific requirements
      return false
    },
  }
}
