import type {
  ChatProvider,
  ChatProviderWithExtraOptions,
  EmbedProvider,
  EmbedProviderWithExtraOptions,
  ModelProvider,
  ModelProviderWithExtraOptions,
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { ProgressInfo } from '@xsai-transformers/shared/types'
import type { MaybePromise } from 'clustr'
import type { ComposerTranslation } from 'vue-i18n'
import type { $ZodType } from 'zod/v4/core'

export type ProviderInstance
  = | ChatProvider
    | ChatProviderWithExtraOptions
    | EmbedProvider
    | EmbedProviderWithExtraOptions
    | SpeechProvider
    | SpeechProviderWithExtraOptions
    | TranscriptionProvider
    | TranscriptionProviderWithExtraOptions
    | ModelProvider
    | ModelProviderWithExtraOptions

export function isModelProvider(providerInstance: ProviderInstance): providerInstance is ModelProvider | ModelProviderWithExtraOptions {
  if ('model' in providerInstance && typeof providerInstance.model === 'function') {
    return true
  }

  return false
}

export interface ProviderExtraMethods<TConfig> {
  listModels?: (config: TConfig, provider: ProviderInstance) => Promise<ModelInfo[]>
  listVoices?: (config: TConfig, provider: ProviderInstance) => Promise<VoiceInfo[]>
  loadModel?: (config: TConfig, provider: ProviderInstance, hooks?: { onProgress?: (progress: ProgressInfo) => Promise<void> | void }) => Promise<void>
}

export interface ProviderValidationResult {
  errors: Array<{ error: unknown, errorKey?: string }>
  reason: string
  reasonKey: string
  valid: boolean
}

/**
 * Validator ID fragment for the chat completions probe.
 * Matched via `.includes()` against validator instance ids
 * (e.g. `openai-compatible:check-chat-completions`).
 */
export const CHAT_COMPLETIONS_VALIDATOR_ID = 'check-chat-completions'

export enum ProviderValidationCheck {
  /** Lightweight GET to /models endpoint to check reachability (definition system) */
  Connectivity = 'connectivity',
  /** Fetch model list and verify non-empty */
  ModelList = 'model_list',
  /** Send generateText ping with fine-grained error handling and caching (definition system) */
  ChatCompletions = 'chat_completions',
  /**
   * @deprecated
   * Being used in builder system (a deprecated provider creation protocol),
   * currently used by only OpenAI TTS && OpenAI Transcription.
   * Send generateText ping with simple pass/fail, fallback to 'test' model (builder system)
   */
  Health = 'health',
}

export interface ProviderValidatorSchedule {
  mode: 'once' | 'interval'
  intervalMs?: number
}

export interface ProviderConfigValidator<TConfig> {
  id: string
  name: string
  validator: (config: TConfig, contextOptions: { t: ComposerTranslation }) => MaybePromise<ProviderValidationResult>
  schedule?: ProviderValidatorSchedule
}

export interface ProviderRuntimeValidator<TConfig> {
  id: string
  name: string
  validator: (config: TConfig, provider: ProviderInstance, providerExtra: ProviderExtraMethods<TConfig>, contextOptions: { t: ComposerTranslation }) => MaybePromise<ProviderValidationResult>
  schedule?: ProviderValidatorSchedule
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  description?: string
  capabilities?: string[]
  contextLength?: number
  deprecated?: boolean
}

export interface VoiceInfo {
  id: string
  name: string
  provider: string
  compatibleModels?: string[]
  description?: string
  gender?: string
  deprecated?: boolean
  previewURL?: string
  languages: {
    code: string
    title: string
  }[]
}

// eslint-disable-next-line ts/no-unnecessary-type-constraint
export interface ProviderDefinition<TConfig extends any = any> {
  id: string
  order?: number
  tasks: string[]
  nameLocalize: (ctx: { t: (input: string) => string }) => string // i18n key for provider name
  name: string // Default name (fallback)
  descriptionLocalize: (ctx: { t: (input: string) => string }) => string // i18n key for provider description
  description: string // Default description (fallback)
  /**
   * Iconify JSON icon name for the provider.
   *
   * Icons are available for most of the AI provides under @proj-airi/lobe-icons.
   */
  icon?: string
  iconColor?: string
  /**
   * In case of having image instead of icon, you can specify the image URL here.
   */
  iconImage?: string

  /**
   * Indicates whether the provider is available.
   * If not specified, the provider is always available.
   *
   * May be specified when any of the following criteria is required:
   *
   * Platform requirements:
   *
   * - app-* providers are only available on desktop, this is responsible for Tauri runtime checks
   * - web-* providers are only available on web, this means Node.js and Tauri should not be imported or used
   *
   * System spec requirements:
   *
   * - may requires WebGPU / NVIDIA / other types of GPU,
   *   on Web, WebGPU will automatically compiled to use targeting GPU hardware
   * - may requires significant amount of GPU memory to run, especially for
   *   using of small language models within browser or Tauri app
   * - may requires significant amount of memory to run, especially for those
   *   non-WebGPU supported environments.
   */
  isAvailableBy?: () => Promise<boolean> | boolean

  /**
   * If false, the provider does not require user-provided credentials (e.g. API keys).
   * Used for built-in providers that authenticate via JWT Bearer tokens.
   */
  requiresCredentials?: boolean

  createProviderConfig: (contextOptions: { t: ComposerTranslation }) => $ZodType<TConfig>
  createProvider: (config: TConfig) => ProviderInstance
  extraMethods?: ProviderExtraMethods<TConfig>
  validationRequiredWhen?: (config: TConfig) => boolean
  validators?: {
    validateConfig?: Array<(contextOptions: { t: ComposerTranslation }) => ProviderConfigValidator<TConfig>>
    validateProvider?: Array<(contextOptions: { t: ComposerTranslation }) => ProviderRuntimeValidator<TConfig>>
  }
  capabilities?: {
    transcription?: {
      protocol: 'websocket' | 'http'
      generateOutput: boolean
      streamOutput: boolean
      streamInput: boolean
    }
  }
  /**
   * When true, hides the "skip chat ping check" checkbox in the UI even
   * when the provider defines a ChatCompletions validator.
   *
   * By default, the checkbox is shown automatically whenever a provider
   * includes a ChatCompletions runtime validator. Set this to `true` for
   * providers where skipping that check is not meaningful or has not been
   * verified yet.
   */
  disableChatPingCheckUI?: boolean
  business?: (contextOptions: { t: ComposerTranslation }) => {
    troubleshooting?: {
      validators?: {
        openaiCompatibleCheckConnectivity?: {
          label?: string
          content?: string
        }
      }
    }
  }
}
