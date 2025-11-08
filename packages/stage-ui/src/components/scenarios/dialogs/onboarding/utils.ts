import type { InjectionKey, Ref } from 'vue'

export interface OnboardingContext {
  // Provider selection
  selectedProviderId: Ref<string>
  selectedProvider: Ref<any>
  popularProviders: Ref<any[]>

  // Actions
  selectProvider: (provider: any) => void
  handleNextStep: (configData?: { apiKey: string, baseUrl: string, accountId: string }) => Promise<void>
  handlePreviousStep: () => void
  handleSave: () => void
}

export const OnboardingContextKey: InjectionKey<OnboardingContext> = Symbol('onboarding-context')
