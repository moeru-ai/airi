export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://api.airi.build'

/** Free ngrok serves an interstitial page unless this header is present; embedded WKWebView cannot dismiss it. */
const NGROK_SKIP_HEADER = 'ngrok-skip-browser-warning'

/**
 * `window.location` navigations cannot set headers; the iOS DevBridge rewrites
 * such requests. Fetches to `SERVER_URL` on ngrok need this.
 */
export function isNgrokServerUrl(): boolean {
  try {
    return new URL(SERVER_URL).hostname.includes('ngrok')
  }
  catch {
    return false
  }
}

export function applyNgrokSkipRequestHeader(headers: Headers): void {
  if (isNgrokServerUrl())
    headers.set(NGROK_SKIP_HEADER, 'true')
}
