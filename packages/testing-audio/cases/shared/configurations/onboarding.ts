import type { AudioInputPreflightCallback, AudioInputPreflightContext } from '../../../src/types'

import { configureStorage } from './storage'

export interface OnboardingConfiguration {
  completed: boolean
  /** @default false */
  skipped?: boolean
}

type OnboardingResolver = (context: AudioInputPreflightContext) => OnboardingConfiguration | undefined | Promise<OnboardingConfiguration | undefined>

/** Configures onboarding with values selected by one case. */
export function configureOnboarding(resolve: OnboardingResolver): AudioInputPreflightCallback {
  return async (context) => {
    const configuration = await resolve(context)
    if (!configuration)
      return

    await configureStorage(context.runtime, {
      'onboarding/completed': String(configuration.completed),
      'onboarding/skipped': String(configuration.skipped ?? false),
    })

    if (configuration.completed || configuration.skipped) {
      await new Promise(resolveWait => setTimeout(resolveWait, 1_000))
      const onboardingPages = context.runtime.electronApp
        ?.windows()
        .filter(page => new URL(page.url()).hash.startsWith('#/onboarding')) ?? []
      await Promise.all(onboardingPages.map(page => page.close().catch(() => undefined)))
    }
  }
}
