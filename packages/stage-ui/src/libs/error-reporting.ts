import type { Pinia } from 'pinia'

import { useSettingsAnalytics } from '../stores/settings/analytics'

/**
 * Reads the analytics switch, which also controls error reports.
 *
 * An app calls it once when its Sentry SDK starts, to decide whether a native crash handler runs. A native handler
 * sends without `beforeSend`, so only this start value can stop it.
 */
export function isErrorReportingAllowed(pinia: Pinia): boolean {
  return useSettingsAnalytics(pinia).analyticsEnabled
}

/**
 * Creates the Sentry `beforeSend` filter that applies the analytics switch to error reports.
 *
 * The filter reads the setting for each event, so a change applies to the next report. It reads the store only
 * when the first event arrives, so creating the filter before the app mounts does not create the store early.
 */
export function createErrorReportingConsentFilter(pinia: Pinia): <TEvent>(event: TEvent) => TEvent | null {
  return event => isErrorReportingAllowed(pinia) ? event : null
}
