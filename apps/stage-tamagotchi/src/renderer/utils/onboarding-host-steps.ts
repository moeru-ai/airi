import type { OnboardingStep } from '@proj-airi/stage-ui/components'

import { OnboardingStepAnalyticsNotice } from '@proj-airi/stage-ui/components'
import { isAnalyticsAvailableInBuild } from '@proj-airi/stage-ui/libs/product-signals'

/**
 * The desktop host steps. The stage window registers them, because it decides at startup and opens the
 * onboarding window. The onboarding window registers them and renders them. Both must use this list.
 */
export function onboardingHostSteps(): OnboardingStep[] {
  return isAnalyticsAvailableInBuild()
    ? [{ id: 'analytics-notice', component: OnboardingStepAnalyticsNotice }]
    : []
}
