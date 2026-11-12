import type { ErrorReportingAdapter, ErrorReportingAdapterOptions } from '@proj-airi/stage-ui/libs/product-signals/error-reporting'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { sharedSentryOptions } from '@proj-airi/stage-shared/analytics/sentry'
import { captureException, init, setUser } from '@sentry/electron/renderer'

import { electronErrorReportingSet } from '../../shared/eventa'

/**
 * Starts `@sentry/electron/renderer` in one window.
 *
 * The renderer SDK forwards each report to main, and main sends it only while the switch is on. The DSN is set in
 * main. This adapter sends each change of the switch to main, which saves it for the next start.
 */
export function createSentryAdapter({ beforeSend }: ErrorReportingAdapterOptions): ErrorReportingAdapter {
  init({ ...sharedSentryOptions, beforeSend })

  const setErrorReporting = useElectronEventaInvoke(electronErrorReportingSet)
  return {
    captureException,
    setUser,
    setEnabled(enabled) {
      // Main keeps its saved value when a send fails, and the next change sends again.
      setErrorReporting(enabled).catch(error => console.warn('[error-reporting] Cannot send the switch to main:', errorMessageFrom(error)))
    },
  }
}
