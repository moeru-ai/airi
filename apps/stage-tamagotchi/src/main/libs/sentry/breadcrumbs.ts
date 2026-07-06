/**
 * Bridges @guiiai/logg global hook output to Sentry breadcrumbs.
 *
 * After setup, every log line that passes through the global log hook is
 * forwarded to Sentry as a breadcrumb, giving error reports rich contextual logs.
 *
 * Chains with any pre-existing hook (e.g., the file logger in `main/index.ts`).
 *
 * @example
 * ```typescript
 * import { setupSentryBreadcrumbsFromLogg } from './libs/sentry/breadcrumbs'
 * import { setupSentry } from './libs/sentry'
 *
 * setupSentry()
 * // Must be called AFTER the file logger is registered so the existing hook is chained.
 * setupSentryBreadcrumbsFromLogg()
 * ```
 */
import type { Log, LogLevelString } from '@guiiai/logg'
import type { SeverityLevel } from '@sentry/electron/main'

import { getGlobalHookPostLog, setGlobalHookPostLog } from '@guiiai/logg'

/**
 * Maps @guiiai/log levels to Sentry severity levels.
 */
function toSentrySeverity(level: LogLevelString): SeverityLevel {
  switch (level) {
    case 'error':
      return 'error'
    case 'warn':
      return 'warning'
    case 'log':
      return 'info'
    case 'debug':
    default:
      return 'debug'
  }
}

/**
 * Registers a log hook that forwards every formatted log line to Sentry breadcrumbs.
 * Preserves and chains the previous hook (for example, the file logger).
 *
 * @returns A disposer to unregister the hook (by restoring the previous one).
 */
export function setupSentryBreadcrumbsFromLogg(): () => void {
  const previousHook = getGlobalHookPostLog()

  setGlobalHookPostLog((log: Log, formatted: string) => {
    // Forward to Sentry as a breadcrumb
    try {
      // Lazy import avoids hard-require before Sentry is initialized.
      // eslint-disable-next-line ts/no-require-imports
      const Sentry = require('@sentry/electron/main')
      Sentry.addBreadcrumb({
        message: log.message,
        category: log.context || 'app',
        level: toSentrySeverity(log.level),
        timestamp: (log['@timestamp'] ?? Date.now()) / 1000,
        data: Object.keys(log.fields).length > 0 ? log.fields : undefined,
      })
    } catch {
      // Sentry not available — breadcrumb silently skipped.
    }

    // Chain the previous hook (file logger) so we don't replace it.
    previousHook?.(log, formatted)
  })

  return () => {
    setGlobalHookPostLog(previousHook)
  }
}
