import posthog from 'posthog-js'

import { DEFAULT_POSTHOG_CONFIG, POSTHOG_ENABLED, POSTHOG_PROJECT_KEY_DESKTOP } from '../../../../../posthog.config'

if (POSTHOG_ENABLED) {
  posthog.init(POSTHOG_PROJECT_KEY_DESKTOP, {
    ...DEFAULT_POSTHOG_CONFIG,
  })
}
