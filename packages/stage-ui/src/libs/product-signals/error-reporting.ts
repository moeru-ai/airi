import type { App } from 'vue'

import { errorMessageFrom } from '@moeru/std'

import { isAnalyticsAvailableInBuild } from './client'

/**
 * Provider contract behind error reports. Each app implements it with the Sentry SDK of its platform, after `init`.
 *
 * Use the functions of the SDK directly: `captureException` and `setUser` of every Sentry SDK fit this shape.
 */
export interface ErrorReportingAdapter {
  /**
   * The `vue` context holds `componentName` and `lifecycleHook`, where Vue caught the error, for example
   * `setup function`. It is a record, because Sentry contexts are records.
   */
  captureException: (error: unknown, context: { contexts: { vue: Record<string, unknown> } }) => unknown
  setUser: (user: { id: string } | null) => void
  /** Hears each change of the analytics switch. Desktop sends it to main, which sends every report. */
  setEnabled?: (enabled: boolean) => void
}

/** What an app needs to start its Sentry SDK. */
export interface ErrorReportingAdapterOptions {
  /** Whether reports are on now. A native crash handler that skips `beforeSend` reads it once, at start. */
  isEnabled: () => boolean
  /** The `beforeSend` option. It reads the switch for each event, so a change applies to the next report. */
  beforeSend: <TEvent>(event: TEvent) => TEvent | null
}

/** Starts the Sentry SDK of one app. Load it with a dynamic import, so the SDK stays out of the main chunk. */
export type ErrorReportingAdapterLoader = (options: ErrorReportingAdapterOptions) => Promise<ErrorReportingAdapter>

/** Vue errors that arrive before the SDK chunk loads. Older errors are dropped. */
const maxPendingErrors = 20

/**
 * Owns error reporting for one JavaScript runtime.
 *
 * The analytics lifecycle in `./index` calls `setUser` and `setEnabled`, so error reports follow the same switch and
 * the same AIRI user as product events. The values that arrive before the adapter loads are applied when it loads.
 */
class ErrorReporting {
  private adapter: ErrorReportingAdapter | undefined
  private enabled: boolean | undefined
  private userId: string | null = null
  private readonly pendingErrors: Array<{ error: unknown, vue: Record<string, unknown> }> = []

  start(app: App, isEnabled: () => boolean, loader: ErrorReportingAdapterLoader): void {
    if (!isAnalyticsAvailableInBuild())
      return

    this.installVueErrorHandler(app)
    void loader({ isEnabled, beforeSend: event => isEnabled() ? event : null })
      .then(adapter => this.attach(adapter))
      .catch(error => console.warn('[error-reporting] Cannot start the SDK:', errorMessageFrom(error)))
  }

  setUser(userId: string | null): void {
    this.userId = userId
    this.adapter?.setUser(userId ? { id: userId } : null)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.adapter?.setEnabled?.(enabled)
  }

  private attach(adapter: ErrorReportingAdapter): void {
    this.adapter = adapter
    if (this.userId)
      adapter.setUser({ id: this.userId })
    if (this.enabled !== undefined)
      adapter.setEnabled?.(this.enabled)
    for (const { error, vue } of this.pendingErrors.splice(0))
      adapter.captureException(error, { contexts: { vue } })
  }

  /**
   * Reports errors that Vue catches. Vue logs them and does not rethrow them, so the SDK global handlers never see
   * them. The handler keeps the console output, as Vue prints the error only when no handler is set.
   */
  private installVueErrorHandler(app: App): void {
    const previous = app.config.errorHandler
    app.config.errorHandler = (error, instance, lifecycleHook) => {
      const vue = { componentName: instance?.$options.name ?? instance?.$options.__name, lifecycleHook }
      if (this.adapter) {
        this.adapter.captureException(error, { contexts: { vue } })
      }
      else {
        if (this.pendingErrors.length === maxPendingErrors)
          this.pendingErrors.shift()
        this.pendingErrors.push({ error, vue })
      }

      if (previous)
        previous(error, instance, lifecycleHook)
      else
        console.error(error)
    }
  }
}

const errorReporting = new ErrorReporting()

/**
 * Starts error reports in a build with analytics. Call it after `createApp` and before `mount`.
 *
 * `isEnabled` reads the analytics switch. An app without settings passes `() => true`.
 */
export function startErrorReporting(app: App, isEnabled: () => boolean, loader: ErrorReportingAdapterLoader): void {
  errorReporting.start(app, isEnabled, loader)
}

/** Sets the AIRI user of later reports. `null` clears it after logout. */
export function setErrorReportingUser(userId: string | null): void {
  errorReporting.setUser(userId)
}

/** Sends a change of the analytics switch to the adapter. */
export function setErrorReportingEnabled(enabled: boolean): void {
  errorReporting.setEnabled(enabled)
}
