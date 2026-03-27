import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { OnboardingWindowManager } from '../../../windows/onboarding'

import { defineInvokeHandler } from '@moeru/eventa'

import { electronOpenOnboarding } from '../../../../shared/eventa'

export function createOnboardingService(params: {
  context: ReturnType<typeof createContext>['context']
  onboardingWindowManager: OnboardingWindowManager
}) {
  defineInvokeHandler(params.context, electronOpenOnboarding, async () => {
    await params.onboardingWindowManager.getAndToggleWindow()
  })
}
