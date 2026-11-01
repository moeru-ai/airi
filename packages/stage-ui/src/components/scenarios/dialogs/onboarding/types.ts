import type { Component } from 'vue'

import type { HostOnboardingStep } from '../../../../stores/onboarding'

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

/**
 * A step with its component. A host step also registers its `id`, `version`, `scope`, and
 * `requires` with `registerHostSteps`. A shared step takes them from `sharedOnboardingSteps`.
 */
export interface OnboardingStep extends HostOnboardingStep {
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
