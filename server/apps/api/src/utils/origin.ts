import { matchesTrustedOriginRule, TRUSTED_ORIGINS } from '@proj-airi/auth-shared'

function getOriginFromUrl(url: string): string | undefined {
  try {
    return new URL(url).origin
  }
  catch {
    return undefined
  }
}

function isTrustedOrigin(origin: string, additionalTrustedOrigins: readonly string[]): boolean {
  return TRUSTED_ORIGINS.includes(origin)
    || additionalTrustedOrigins.includes(origin)
    || matchesTrustedOriginRule(origin)
}

/**
 * Checks whether a browser can open the origin as a web page after Stripe.
 *
 * Accepted: `https:` origins, and loopback dev servers with a port on `http:` or `https:`.
 * Rejected: `https://localhost` without a port, because it is the Android Capacitor app origin,
 * and native schemes such as `capacitor://localhost` and deep links. They are not pages on the web.
 */
function isWebOrigin(origin: string): boolean {
  const url = new URL(origin)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    return url.port !== '' && (url.protocol === 'http:' || url.protocol === 'https:')
  return url.protocol === 'https:'
}

function resolveWebRedirectOrigin(origin: string | undefined, additionalTrustedOrigins: readonly string[]): string | undefined {
  if (!origin || !isTrustedOrigin(origin, additionalTrustedOrigins) || !isWebOrigin(origin))
    return undefined
  return origin
}

/**
 * Resolves the base URL for Stripe redirect targets (`success_url` / `cancel_url` / portal `return_url`).
 *
 * The base is the trusted web origin of the request, from `Referer` first and then `Origin`,
 * so a web user returns to the surface where the checkout started. Trusted means
 * `TRUSTED_ORIGINS`, `additionalTrustedOrigins`, or `matchesTrustedOriginRule`.
 *
 * Other requests fall back to `webAppFallbackUrl`. Stripe accepts only http and https redirect URLs,
 * and a native app origin is not a page that a browser can open. This covers packaged Electron
 * (`file://`, so `Origin: null`), stage-pocket (`capacitor://localhost` and `https://localhost`),
 * deep-link schemes, and a missing origin.
 */
export function resolveCheckoutRedirectBase(
  request: Request,
  additionalTrustedOrigins: readonly string[],
  webAppFallbackUrl: string,
): string {
  const refererOrigin = getOriginFromUrl(request.headers.get('referer') ?? '')
  return resolveWebRedirectOrigin(refererOrigin, additionalTrustedOrigins)
    ?? resolveWebRedirectOrigin(request.headers.get('origin') ?? undefined, additionalTrustedOrigins)
    ?? webAppFallbackUrl
}
