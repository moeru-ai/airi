import type { ErrorReportingAdapter, ErrorReportingAdapterOptions } from '@proj-airi/stage-ui/libs/product-signals/error-reporting'

import { SENTRY_PROJECTS, sharedSentryOptions } from '@proj-airi/stage-shared/analytics/sentry'
import { captureException, init, setUser } from '@sentry/capacitor'

/**
 * Starts `@sentry/capacitor` for the mobile app, with its bundled `@sentry/browser`.
 *
 * The iOS and Android SDKs send native crashes without `beforeSend`, so they start only when the switch is on at app
 * start. A crash in a session where the user turned the switch off stays on the device. A later start sends it only
 * when the switch is on again.
 */
export function createSentryAdapter({ isEnabled, beforeSend }: ErrorReportingAdapterOptions): ErrorReportingAdapter {
  init({
    ...sharedSentryOptions,
    dsn: SENTRY_PROJECTS.mobile.dsn,
    environment: import.meta.env.MODE,
    beforeSend,
    enableNative: isEnabled(),
    // Native sessions skip `beforeSend`, as the JavaScript ones do.
    enableAutoSessionTracking: false,
  })
  return { captureException, setUser }
}
