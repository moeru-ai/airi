import type { ErrorReportingAdapter, ErrorReportingAdapterOptions } from '@proj-airi/stage-ui/libs/product-signals/error-reporting'

import { SENTRY_PROJECTS, sharedSentryOptions } from '@proj-airi/stage-shared/analytics/sentry'
import { captureException, init, setUser } from '@sentry/browser'

/** Starts `@sentry/browser` for the sign-in pages. Reports go to the web project with the `auth` surface tag. */
export function createSentryAdapter({ beforeSend }: ErrorReportingAdapterOptions): ErrorReportingAdapter {
  init({
    ...sharedSentryOptions,
    dsn: SENTRY_PROJECTS.web.dsn,
    environment: import.meta.env.MODE,
    beforeSend,
    initialScope: { tags: { app_surface: 'auth' } },
  })
  return { captureException, setUser }
}
