import type { AnalyticsAdapter } from '../analytics'

import posthog from 'posthog-js'

import {
  DEFAULT_POSTHOG_CONFIG,
  POSTHOG_PROJECT_KEY,
} from '@proj-airi/stage-shared/analytics/posthog'

/** Creates the auth analytics adapter and initializes its provider SDK. */
export function createPosthogAdapter(): AnalyticsAdapter {
  posthog.init(POSTHOG_PROJECT_KEY, { ...DEFAULT_POSTHOG_CONFIG })
  // The shared project distinguishes auth traffic through this super property.
  posthog.register({ app_surface: 'auth' })

  return {
    capture(event, properties, options) {
      posthog.capture(
        event,
        properties,
        options?.beforeNavigation ? { send_instantly: true, transport: 'sendBeacon' } : undefined,
      )
    },
    identify(userId) {
      posthog.identify(userId)
    },
  }
}
