import type { AnalyticsAdapter } from '../analytics'

import posthog from 'posthog-js'

import { DEFAULT_POSTHOG_CONFIG, POSTHOG_PROJECT_KEY } from '@proj-airi/stage-shared/analytics/posthog'

/** Sends auth milestones to the same PostHog project as the stage apps. */
export function createPosthogAdapter(): AnalyticsAdapter {
  posthog.init(POSTHOG_PROJECT_KEY, { ...DEFAULT_POSTHOG_CONFIG })
  // The shared project tells auth traffic apart through this super property.
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
