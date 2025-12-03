import type { InjectionKey, Ref } from 'vue'

import type { ProviderMetadata } from '../../../../stores/providers'

export interface OnboardingContext {
  selectedProviderId: Ref<string>
  selectedProvider: Ref<ProviderMetadata | null>
  popularProviders: Ref<ProviderMetadata[]>
  selectProvider: (provider: ProviderMetadata) => void
  handleNextStep: (configData?: { apiKey: string, baseUrl: string, accountId: string }) => Promise<void>
  handlePreviousStep: () => void
  handleSave: () => void
}

export const OnboardingContextKey: InjectionKey<OnboardingContext> = Symbol('onboarding-context')
