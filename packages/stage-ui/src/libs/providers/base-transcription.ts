import type {
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ModelInfo } from '../../stores/providers'
import type { ProviderValidationResult } from './base-types'

/**
 * Transcription features supported by a provider
 */
export interface TranscriptionFeatures {
  supportsGenerate: boolean
  supportsStreamOutput: boolean
  supportsStreamInput: boolean
}

/**
 * Common configuration for transcription providers
 */
export interface BaseTranscriptionProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  [key: string]: unknown
}

/**
 * Base interface that all transcription provider implementations should follow.
 *
 * This provides a consistent contract for transcription providers beyond
 * what's defined in the external @xsai-ext/providers/utils library.
 *
 * @template TOptions - Type for provider-specific options
 */
export interface BaseTranscriptionProviderDefinition<TOptions = Record<string, unknown>> {
  /**
   * Unique identifier for this provider
   */
  readonly id: string

  /**
   * Default model to use when none is specified
   */
  readonly defaultModel: string

  /**
   * Transcription features supported by this provider
   */
  readonly transcriptionFeatures: TranscriptionFeatures

  /**
   * Validate provider configuration
   *
   * @param config - Provider configuration to validate
   * @returns Validation result indicating if config is valid
   */
  validateConfig: (config: BaseTranscriptionProviderConfig) => Promise<ProviderValidationResult> | ProviderValidationResult

  /**
   * Get the transcription provider instance
   *
   * @param config - Provider configuration
   * @returns The transcription provider instance
   */
  createProvider: (
    config: BaseTranscriptionProviderConfig,
  ) => Promise<TranscriptionProvider | TranscriptionProviderWithExtraOptions<string, TOptions>>
    | TranscriptionProvider
    | TranscriptionProviderWithExtraOptions<string, TOptions>

  /**
   * List available models for this provider
   *
   * @param config - Provider configuration
   * @returns List of available models
   */
  listModels?: (config: BaseTranscriptionProviderConfig) => Promise<ModelInfo[]>

  /**
   * Get default configuration options
   *
   * @returns Default configuration
   */
  getDefaultConfig?: () => Partial<BaseTranscriptionProviderConfig>
}

/**
 * Helper type guard to check if a provider definition implements the base interface
 */
export function isBaseTranscriptionProviderDefinition(
  provider: unknown,
): provider is BaseTranscriptionProviderDefinition {
  return (
    typeof provider === 'object'
    && provider !== null
    && 'id' in provider
    && 'defaultModel' in provider
    && 'transcriptionFeatures' in provider
    && 'validateConfig' in provider
    && 'createProvider' in provider
  )
}
