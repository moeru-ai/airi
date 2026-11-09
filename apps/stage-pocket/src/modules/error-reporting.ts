import type { Pinia } from 'pinia'
import type { App } from 'vue'

import { errorReportingDataCollection, selectErrorReportingIntegrations } from '@proj-airi/stage-shared/analytics/error-reporting'
import { createErrorReportingConsentFilter, isErrorReportingAllowed } from '@proj-airi/stage-ui/libs/error-reporting'
import { init } from '@sentry/capacitor'
import { breadcrumbsIntegration, init as initVue } from '@sentry/vue'

/**
 * Starts Sentry error reports for the mobile app.
 *
 * The analytics switch applies to each JavaScript report through `beforeSend`. The iOS and Android SDKs send native
 * crashes without that filter, so they start only when the switch is on at app start. A crash in a session where
 * the user turned the switch off stays on the device. It is sent at a later start only if the switch is on again.
 */
export function setupErrorReporting(app: App, pinia: Pinia): void {
  init({
    dsn: 'https://168e3e93cd7df3da42b2b449c7f52058@o4512400996827136.ingest.us.sentry.io/4512401048993792',
    environment: import.meta.env.MODE,
    enableNative: isErrorReportingAllowed(pinia),
    // Sessions skip `beforeSend`, so they would still go out while the switch is off.
    enableAutoSessionTracking: false,
    // Component props can hold chat messages and character cards.
    siblingOptions: { vueOptions: { app, attachErrorHandler: true, attachProps: false } },
    dataCollection: errorReportingDataCollection,
    // Sentry JS 10 records console messages in `Breadcrumbs`, and they can hold chat text.
    integrations: defaults => selectErrorReportingIntegrations(defaults, [breadcrumbsIntegration({ console: false })]),
    sendClientReports: false,
    beforeSend: createErrorReportingConsentFilter(pinia),
  }, initVue)
}
