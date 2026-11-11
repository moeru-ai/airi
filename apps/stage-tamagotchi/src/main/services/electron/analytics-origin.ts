import type { WebRequest } from 'electron'

import { OPENPANEL_CONFIG } from '@proj-airi/stage-shared/analytics/openpanel'

/**
 * Makes product events from packaged renderer pages pass OpenPanel's origin check.
 *
 * Call it one time for the session of the AIRI renderer windows, after the app is ready.
 * Electron keeps one `onBeforeSendHeaders` listener for each session, so a later listener replaces this one.
 * A page from the development server sends its own `Origin`, and this listener keeps it.
 */
export function setupAnalyticsRequestOrigin(targetSession: { webRequest: Pick<WebRequest, 'onBeforeSendHeaders'> }): void {
  // NOTICE:
  // Electron sends no `Origin` header from a `file://` page, which a packaged window loads.
  // OpenPanel answers 401 to such a request, and the SDK drops the event without an error.
  // Source: `validateSdkRequest` in OpenPanel `apps/api/src/utils/auth.ts`.
  // Remove this when packaged pages send `Origin`, or when OpenPanel accepts requests without it.
  targetSession.webRequest.onBeforeSendHeaders({ urls: [`${new URL(OPENPANEL_CONFIG.apiUrl).origin}/*`] }, (details, callback) => {
    const hasOrigin = Object.keys(details.requestHeaders).some(name => name.toLowerCase() === 'origin')
    callback({
      // `null` is the value that Chromium sends for a page with an opaque origin.
      requestHeaders: hasOrigin ? details.requestHeaders : { ...details.requestHeaders, Origin: 'null' },
    })
  })
}
