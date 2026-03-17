import posthog from 'posthog-js'

import { DEFAULT_POSTHOG_CONFIG, POSTHOG_ENABLED, POSTHOG_PROJECT_KEY_POCKET } from '../../../../posthog.config'

if (POSTHOG_ENABLED) {
  posthog.init(POSTHOG_PROJECT_KEY_POCKET, {
    ...DEFAULT_POSTHOG_CONFIG,
  })
}
