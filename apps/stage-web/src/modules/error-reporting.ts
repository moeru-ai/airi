import type { Pinia } from 'pinia'
import type { App } from 'vue'

import { errorReportingDataCollection, selectErrorReportingIntegrations } from '@proj-airi/stage-shared/analytics/error-reporting'
import { createErrorReportingConsentFilter } from '@proj-airi/stage-ui/libs/error-reporting'
import { init } from '@sentry/vue'

/** Starts Sentry error reports for the web app. The analytics switch in the settings applies to each report. */
export function setupErrorReporting(app: App, pinia: Pinia): void {
  init({
    app,
    dsn: 'https://d1f8d44162b7d48c41fb553988e48c93@o4512400996827136.ingest.us.sentry.io/4512401048928256',
    environment: import.meta.env.MODE,
    // Component props can hold chat messages and character cards.
    attachProps: false,
    dataCollection: errorReportingDataCollection,
    integrations: defaults => selectErrorReportingIntegrations(defaults, []),
    // Client reports skip `beforeSend`, so they would still go out while the switch is off.
    sendClientReports: false,
    beforeSend: createErrorReportingConsentFilter(pinia),
  })
}
