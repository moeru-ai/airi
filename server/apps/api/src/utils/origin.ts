function getOriginFromUrl(url: string): string | undefined {
  try {
    return new URL(url).origin
  }
  catch {
    return undefined
  }
}

const TRUSTED_EXACT_ORIGINS = [
  'https://airi.moeru.ai', // Production web app
  'capacitor://localhost', // Capacitor mobile (iOS)
  'ai.moeru.airi-pocket://links', // Android deep link
  'https://accounts.airi.build', // Standalone auth UI
  'https://server-dev.airi-server-auth.pages.dev', // Server-dev standalone auth UI
]

// NOTICE:
// Private LAN / CGNAT-style dev hosts (e.g. https://10.x:5273 from cap-vite) are NOT matched
// by regex here — list them explicitly via env `ADDITIONAL_TRUSTED_ORIGINS` (see env.ts).
const TRUSTED_ORIGIN_PATTERNS = [
  // Localhost dev (any port)
  /^http:\/\/localhost(:\d+)?$/,
  // Loopback interface for Electron OIDC callbacks (RFC 8252 S7.3)
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  // Vite + mkcert (https://localhost:5273, etc.)
  /^https:\/\/localhost(:\d+)?$/,
  /^https:\/\/127\.0\.0\.1(:\d+)?$/,
  // Cloudflare Workers subdomains
  /^https:\/\/.*\.kwaa\.workers\.dev$/,
]

/**
 * Returns `origin` when it matches built-in trust rules or `additionalTrustedOrigins`.
 *
 * Use when:
 * - CORS allowlists (`/api/*`) or Stripe redirect base resolution need the same rules as Better Auth.
 *
 * Expects:
 * - `origin` is the raw `Origin` header value or `new URL(referer).origin`.
 * - `additionalTrustedOrigins` entries are normalized by the environment schema.
 *
 * Returns:
 * - The same origin string when trusted, or `''` when not trusted.
 */
export function getTrustedOrigin(origin: string, additionalTrustedOrigins: readonly string[] = []): string {
  if (!origin)
    return origin
  if (TRUSTED_EXACT_ORIGINS.includes(origin))
    return origin
  if (additionalTrustedOrigins.includes(origin))
    return origin
  if (TRUSTED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin)))
    return origin
  return ''
}

/**
 * Resolves a trusted browser origin from `Referer` (preferred) or `Origin`.
 *
 * Expects:
 * - Same trust inputs as {@link getTrustedOrigin}.
 *
 * Returns:
 * - The trusted origin string, or `undefined` when neither header yields a trusted origin.
 */
export function resolveTrustedRequestOrigin(
  request: Request,
  additionalTrustedOrigins: readonly string[] = [],
): string | undefined {
  const refererOrigin = getOriginFromUrl(request.headers.get('referer') ?? '')
  if (refererOrigin) {
    const trustedRefererOrigin = getTrustedOrigin(refererOrigin, additionalTrustedOrigins)
    if (trustedRefererOrigin) {
      return trustedRefererOrigin
    }
  }

  const requestOrigin = request.headers.get('origin') ?? ''
  const trustedRequestOrigin = getTrustedOrigin(requestOrigin, additionalTrustedOrigins)
  if (trustedRequestOrigin) {
    return trustedRequestOrigin
  }

  return undefined
}

/**
 * Resolves the base URL for Stripe redirect targets (`success_url` / `cancel_url` / portal `return_url`).
 *
 * Prefers the request's trusted browser origin so web and mobile users return to the surface they
 * started from. Falls back to the configured web app URL when the request carries no trusted origin —
 * notably the Electron desktop renderer, which loads from `file://` and sends no usable web origin,
 * so Stripe (which only accepts http/https redirect URLs) can still land users on a real page.
 *
 * Expects:
 * - Same trust inputs as {@link resolveTrustedRequestOrigin}.
 * - `webAppFallbackUrl` is an absolute origin used verbatim as the base.
 *
 * Returns:
 * - The trusted request origin when present, otherwise `webAppFallbackUrl` (always a usable base).
 */
export function resolveCheckoutRedirectBase(
  request: Request,
  additionalTrustedOrigins: readonly string[],
  webAppFallbackUrl: string,
): string {
  return resolveTrustedRequestOrigin(request, additionalTrustedOrigins) ?? webAppFallbackUrl
}
