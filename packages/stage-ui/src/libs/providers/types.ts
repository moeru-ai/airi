import type { ProviderDefinition as CoreProviderDefinition } from '@proj-airi/provider-inference'

import type { ProviderViews } from './views'

/**
 * Stage-ui extends portable definitions with Vue-owned views.
 *
 * The core provider contract remains runtime-neutral.
 */
export interface ProviderDefinition<TConfig = Record<string, unknown>, TId extends string = string> extends CoreProviderDefinition<TConfig, TId> {
  /** Optional stage-ui views for this Provider. */
  views?: ProviderViews
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
