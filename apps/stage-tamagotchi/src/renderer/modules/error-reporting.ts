import type { Pinia } from 'pinia'
import type { App } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { errorReportingDataCollection, selectErrorReportingIntegrations } from '@proj-airi/stage-shared/analytics/error-reporting'
import { useSettingsAnalytics } from '@proj-airi/stage-ui/stores/settings/analytics'
import { init } from '@sentry/electron/renderer'
import { init as initVue } from '@sentry/vue'
import { watch } from 'vue'

import { electronErrorReportingSet } from '../../shared/eventa'

/**
 * Starts Sentry in a renderer window and sends the analytics switch to main.
 *
 * The renderer SDK forwards each report to main, and main decides whether it is sent. The watcher lives as long as
 * the window. Each window sends the same synced value, so a repeated send changes nothing.
 */
export function setupErrorReporting(app: App, pinia: Pinia): void {
  init<NonNullable<Parameters<typeof initVue>[0]>>({
    app,
    // Component props can hold chat messages and character cards.
    attachProps: false,
    dataCollection: errorReportingDataCollection,
    integrations: defaults => selectErrorReportingIntegrations(defaults, []),
    sendClientReports: false,
  }, initVue)

  const setErrorReporting = useElectronEventaInvoke(electronErrorReportingSet)
  watch(() => useSettingsAnalytics(pinia).analyticsEnabled, (enabled) => {
    // Main keeps its saved value when a send fails, and the next change sends again.
    setErrorReporting(enabled).catch(error => console.warn('[error-reporting] Cannot send the switch to main:', errorMessageFrom(error)))
  }, { immediate: true })
}
