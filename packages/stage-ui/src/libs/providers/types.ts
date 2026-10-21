import type { ProviderDefinition as CoreProviderDefinition } from '@proj-airi/provider-inference'

import type { ProviderViews } from './views'

/**
 * Host state that the provider store gives to a provider instance. The provider reads it on each request, so a
 * changed value applies without a new instance.
 */
export interface ProviderRuntime {
  /** Reads a flag from `useFeatureFlagsStore()`. An unknown key returns false. */
  isFeatureEnabled: (key: string) => boolean
}

/**
 * Stage-ui extends portable definitions with Vue-owned views.
 *
 * The core provider contract remains runtime-neutral.
 */
export interface ProviderDefinition<TConfig = Record<string, unknown>, TId extends string = string> extends CoreProviderDefinition<TConfig, TId> {
  /** Optional stage-ui views for this Provider. */
  views?: ProviderViews
  /**
   * Settings route that the Providers page opens for this Provider.
   *
   * Set it when the settings live somewhere other than
   * `/settings/providers/<category>/<id>`, so the card does not open an empty route.
   */
  to?: string
  /**
   * Creates the provider instance. Only the cached instance of the provider store receives `runtime`. Temporary
   * instances, for example for model lists and validators, omit it.
   */
  createProvider: (config: TConfig, runtime?: ProviderRuntime) => ReturnType<CoreProviderDefinition<TConfig, TId>['createProvider']>
}

export {
  CHAT_COMPLETIONS_VALIDATOR_ID,
  isModelProvider,
  ProviderValidationCheck,
} from '@proj-airi/provider-inference'

export type {
  ChatReasoningCapability,
  ChatReasoningMode,
  ChatRequestOptions,
  InferenceServiceProvider,
  ModelInfo,
  ProviderConfigContext,
  ProviderConfiguredBy,
  ProviderConfigValidator,
  ProviderExtraMethods,
  ProviderInstance,
  ProviderModelCatalog,
  ProviderOnboardingField,
  ProviderRuntimeValidator,
  ProviderTranslator,
  ProviderValidationResult,
  ProviderValidationStatus,
  ProviderValidatorSchedule,
  VoiceInfo,
} from '@proj-airi/provider-inference'
