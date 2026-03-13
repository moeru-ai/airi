import type { Component } from 'vue'

export type OnboardingStepGuard = () => Promise<boolean>
export type OnboardingStepPrevHandler = () => Promise<void> | void

export interface ProviderConfigData {
  apiKey: string
  baseUrl: string
  accountId: string
  // Amazon Bedrock SigV4
  accessKeyId: string
  secretAccessKey: string
  region: string
}

export type OnboardingStepNextHandler = (configData?: ProviderConfigData) => Promise<void> | void

export interface OnboardingStep {
  id: string
  component: Component<{
    configData?: ProviderConfigData
    onNext: OnboardingStepNextHandler
    onPrevious?: OnboardingStepPrevHandler
  }>
  props?: () => Record<string, unknown>
  beforeNext?: OnboardingStepGuard
  beforePrev?: OnboardingStepGuard
}
