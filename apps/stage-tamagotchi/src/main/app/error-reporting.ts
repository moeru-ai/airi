import type { globalAppConfigSchema } from '../configs/global'
import type { Config } from '../libs/electron/persistence'

import { errorReportingDataCollection, selectErrorReportingIntegrations } from '@proj-airi/stage-shared/analytics/error-reporting'
import { init } from '@sentry/electron/main'

/**
 * Owns Sentry error reports for the desktop app.
 *
 * Main sends every report: its own errors, the renderer errors that the SDK forwards over IPC, and the native crash
 * dumps that it finds on the next start. All of them pass `beforeSend` in main, so one switch covers them.
 *
 * The switch is the analytics setting of the renderer. Main saves a copy in the app config, so reports from a start
 * that crashes before a renderer loads also follow the last choice of the user.
 */
export class ErrorReporting {
  constructor(private readonly config: Config<typeof globalAppConfigSchema>) {}

  /** Whether the next report is sent. Absent in the config means on, the same default as the renderer setting. */
  get enabled(): boolean {
    return this.config.get()?.errorReportingEnabled ?? true
  }

  /** Saves the switch that the renderer sent. The next report reads it. */
  setEnabled(enabled: boolean): void {
    if (this.enabled !== enabled)
      this.config.update({ ...this.config.get(), errorReportingEnabled: enabled })
  }

  /** Starts the SDK. Call it once, before the app is ready, as the SDK must start the Electron crash reporter. */
  start(): void {
    init({
      dsn: 'https://707a0d53d3bdc5dd83d2fc1ca894e450@o4512400996827136.ingest.us.sentry.io/4512401048797184',
      environment: import.meta.env.MODE,
      dataCollection: errorReportingDataCollection,
      integrations: defaults => selectErrorReportingIntegrations(defaults, []),
      // Client reports skip `beforeSend`, so they would still go out while the switch is off.
      sendClientReports: false,
      beforeSend: event => this.enabled ? event : null,
    })
  }
}
