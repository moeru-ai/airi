import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ModelInfo, VoiceInfo } from '../../stores/providers'
import type { ProviderValidationResult } from './base-types'

/**
 * Common configuration for speech providers
 */
export interface BaseSpeechProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  voice?: string
  speed?: number
  pitch?: number
  volume?: number
  [key: string]: unknown
}

/**
 * Base interface that all speech provider implementations should follow.
 *
 * @deprecated Use the unified `defineProvider()` pattern instead (see `providers/registry.ts`).
 * This interface is kept for backward compatibility with existing converters.
 *
 * This provides a consistent contract for speech/TTS providers beyond
 * what's defined in the external @xsai-ext/providers/utils library.
 *
 * @template TOptions - Type for provider-specific options
 */
export interface BaseSpeechProviderDefinition<TOptions = Record<string, unknown>> {
  /**
   * Unique identifier for this provider
   */
  readonly id: string

  /**
   * Default model to use when none is specified
   */
  readonly defaultModel: string

  /**
   * Default voice to use when none is specified
   */
  readonly defaultVoice?: string

  /**
   * Validate provider configuration
   *
   * @param config - Provider configuration to validate
   * @returns Validation result indicating if config is valid
   */
  validateConfig: (config: BaseSpeechProviderConfig) => Promise<ProviderValidationResult> | ProviderValidationResult

  /**
   * Get the speech provider instance
   *
   * @param config - Provider configuration
   * @returns The speech provider instance
   */
  createProvider: (
    config: BaseSpeechProviderConfig,
  ) => Promise<SpeechProvider | SpeechProviderWithExtraOptions<string, TOptions>>
    | SpeechProvider
    | SpeechProviderWithExtraOptions<string, TOptions>

  /**
   * List available models for this provider
   *
   * @param config - Provider configuration
   * @returns List of available models
   */
  listModels?: (config: BaseSpeechProviderConfig) => Promise<ModelInfo[]>

  /**
   * List available voices for this provider
   *
   * @param config - Provider configuration
   * @returns List of available voices
   */
  listVoices?: (config: BaseSpeechProviderConfig) => Promise<VoiceInfo[]>

  /**
   * Get default configuration options
   *
   * @returns Default configuration
   */
  getDefaultConfig?: () => Partial<BaseSpeechProviderConfig>

  /**
   * Check if provider supports SSML
   *
   * @returns Whether SSML is supported
   */
  supportsSSML?: () => boolean
}

/**
 * Helper type guard to check if a provider definition implements the base interface
 */
export function isBaseSpeechProviderDefinition(
  provider: unknown,
): provider is BaseSpeechProviderDefinition {
  return (
    typeof provider === 'object'
    && provider !== null
    && 'id' in provider
    && 'defaultModel' in provider
    && 'validateConfig' in provider
    && 'createProvider' in provider
  )
}
