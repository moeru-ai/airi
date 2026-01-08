import type { Component, InjectionKey, Ref } from 'vue'

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

export interface OnboardingStep {
  stepNumber: number
  component: Component
  condition?: () => boolean
}

const additionalStepsRegistry: OnboardingStep[] = []

export function registerOnboardingStep(step: OnboardingStep) {
  additionalStepsRegistry.push(step)
  // Sort by step number
  additionalStepsRegistry.sort((a, b) => a.stepNumber - b.stepNumber)
}

export function getAdditionalOnboardingSteps(): OnboardingStep[] {
  return additionalStepsRegistry.filter(step => !step.condition || step.condition())
}
