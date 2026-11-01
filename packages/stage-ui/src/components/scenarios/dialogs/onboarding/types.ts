import type { Component } from 'vue'

export type OnboardingStepGuard = () => Promise<boolean>
export type OnboardingStepPrevHandler = () => Promise<void> | void

export interface ProviderConfigData {
  apiKey: string
  baseUrl: string
  accountId: string
  customFields?: Record<string, string>
}

export type OnboardingStepNextHandler = (configData?: ProviderConfigData) => Promise<void> | void
/** Postpones an optional step. The flow records it as `later` and moves on without the `beforeNext` guard. */
export type OnboardingStepLaterHandler = () => Promise<void> | void

export interface OnboardingStep {
  id: string
  /**
   * A higher version shows the step again to a user who finished an older version.
   * A shared step takes its version from `sharedOnboardingSteps`.
   *
   * @default 1
   */
  version?: number
  /** When true, the step receives `onLater`, and the user can postpone it. */
  optional?: boolean
  component: Component<{
    configData?: ProviderConfigData
    onNext: OnboardingStepNextHandler
    onPrevious?: OnboardingStepPrevHandler
    onLater?: OnboardingStepLaterHandler
  }>
  props?: () => Record<string, unknown>
  beforeNext?: OnboardingStepGuard
  beforePrev?: OnboardingStepGuard
}
