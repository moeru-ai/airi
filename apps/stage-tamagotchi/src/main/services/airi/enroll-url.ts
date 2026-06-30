/**
 * Builds the system-browser URL for the Steam enrollment page.
 *
 * Use when:
 * - The Steam sign-in flow received a `needs_enrollment` result and is about
 *   to open the system browser.
 *
 * The enroll page is hosted by the standalone auth UI (`authUiUrl`, e.g.
 * `https://accounts.airi.build/ui`). It carries the single-use enrollment
 * `token` and the OIDC `continue` authorize URL the page navigates to once the
 * user has authenticated, so the server can consume the token and link Steam
 * at the authorize choke point.
 *
 * Returns:
 * - An absolute URL `${authUiUrl}/enroll?token=...&continue=...`.
 */
export function buildEnrollUrl(params: {
  authUiUrl: string
  enrollToken: string
  continueUrl: string
}): string {
  const base = params.authUiUrl.replace(/\/+$/, '')
  const url = new URL(`${base}/enroll`)
  url.searchParams.set('token', params.enrollToken)
  url.searchParams.set('continue', params.continueUrl)
  return url.toString()
}
