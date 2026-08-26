import type { Component } from 'vue'

export interface OnboardingStep {
  beforeNext?: OnboardingStepGuard
  beforePrev?: OnboardingStepGuard
  component: Component<{
    configData?: ProviderConfigData
    onNext: OnboardingStepNextHandler
    onPrevious?: OnboardingStepPrevHandler
  }>
  id: string
  props?: () => Record<string, unknown>
}
export type OnboardingStepGuard = () => Promise<boolean>

export type OnboardingStepNextHandler = (configData?: ProviderConfigData) => Promise<void> | void

export type OnboardingStepPrevHandler = () => Promise<void> | void

export interface ProviderConfigData {
  accountId: string
  apiKey: string
  baseUrl: string
  customFields?: Record<string, string>
}
