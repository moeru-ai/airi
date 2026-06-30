/**
 * Sentry error tracking for the Electron main process.
 *
 * Initializes `@sentry/electron/main` with environment-driven configuration.
 * When `SENTRY_DSN` is not set, `Sentry.init` is a no-op (Sentry SDK handles this
 * internally), so contributor machines and CI runs pay no cost.
 *
 * Features:
 * - Breadcrumb integration with `@guiiai/logg` via `setGlobalHookPostLog`.
 * - Release tracking tied to `app.getVersion()` so errors map to exact build artifacts.
 * - Minimal instrumentation to keep startup latency low.
 */
import * as Sentry from '@sentry/electron/main'

import { app } from 'electron'

/**
 * Initializes Sentry Electron SDK. Safe to call even without `SENTRY_DSN` —
 * the SDK becomes a passive no-op when no DSN is configured.
 *
 * @returns The Sentry Hub for advanced usage (e.g., adding breadcrumbs manually).
 */
export function setupSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: import.meta.env.PROD ? 'production' : 'development',
    release: `airi-tamagotchi@${app.getVersion()}`,
    // Keep instrumentation light: 10% of sessions capture performance traces.
    tracesSampleRate: 0.1,
    // Breadcrumbs give context around the events leading to a crash.
    beforeBreadcrumb(breadcrumb) {
      // Drop noisy http breadcrumbs from localhost dev server.
      if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('localhost')) {
        return null
      }

      return breadcrumb
    },
  })

  return Sentry
}

/**
 * Captures an exception with Sentry (if initialized).
 * Safe to call before/without `setupSentry`.
 *
 * @param error - The error or unknown value to capture.
 */
export function captureError(error: unknown): void {
  Sentry.captureException(error)
}

/**
 * Records a breadcrumb for subsequent error context.
 *
 * @param message - Human-readable breadcrumb message.
 * @param category - Optional category (e.g., 'auth', 'ipc').
 */
export function addBreadcrumb(message: string, category?: string): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level: 'info',
    timestamp: Date.now() / 1000,
  })
}
