import type { globalAppConfigSchema } from '../configs/global'
import type { Config } from '../libs/electron/persistence'

import { SENTRY_PROJECTS, sharedSentryOptions } from '@proj-airi/stage-shared/analytics/sentry'
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
      ...sharedSentryOptions,
      dsn: SENTRY_PROJECTS.desktop.dsn,
      environment: import.meta.env.MODE,
      beforeSend: event => this.enabled ? event : null,
    })
  }
}
