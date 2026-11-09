import type { App } from 'vue'

import { errorReportingDataCollection, selectErrorReportingIntegrations } from '@proj-airi/stage-shared/analytics/error-reporting'
import { init } from '@sentry/vue'

/**
 * Starts Sentry error reports for the sign-in pages.
 *
 * The sign-in pages have no settings, so reports follow their analytics posture: on in every build with analytics.
 * Reports go to the stage-web project with the `auth` surface tag.
 */
export function setupErrorReporting(app: App): void {
  init({
    app,
    dsn: 'https://d1f8d44162b7d48c41fb553988e48c93@o4512400996827136.ingest.us.sentry.io/4512401048928256',
    environment: import.meta.env.MODE,
    // Component props can hold form input.
    attachProps: false,
    dataCollection: errorReportingDataCollection,
    integrations: defaults => selectErrorReportingIntegrations(defaults, []),
    sendClientReports: false,
    initialScope: { tags: { app_surface: 'auth' } },
  })
}
