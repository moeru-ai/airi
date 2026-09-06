import posthog from 'posthog-js'

import { DEFAULT_POSTHOG_CONFIG, POSTHOG_PROJECT_KEY } from '@proj-airi/stage-shared/analytics/posthog'

if (!import.meta.env.DEV) {
  posthog.init(POSTHOG_PROJECT_KEY, {
    ...DEFAULT_POSTHOG_CONFIG,
  })
  // Tag docs-site traffic so it can be told apart from the app surfaces
  // inside the shared project.
  posthog.register({ app_surface: 'docs' })
}
