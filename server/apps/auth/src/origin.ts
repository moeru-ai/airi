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
  'https://admin.airi.build', // Standalone admin UI
  'https://server-dev.airi-server-admin.pages.dev', // Server-dev standalone admin UI
]

// NOTICE:
// Better Auth accepts non-http(s) origins by prefix (`url.startsWith(pattern)`),
// so native deep-link schemes must not be copied from TRUSTED_EXACT_ORIGINS
// into auth callback validation. Browser auth callbacks only need web origins.
const TRUSTED_AUTH_CALLBACK_ORIGINS = TRUSTED_EXACT_ORIGINS.filter((origin) => {
  const protocol = new URL(origin).protocol
  return protocol === 'http:' || protocol === 'https:'
})

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
 * - Auth CORS allowlists and callback validation need the same trust policy.
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

// NOTICE:
// Better Auth's callbackURL validation walks `trustedOrigins`. Static entries
// support `*` wildcards via the framework's wildcardMatch (see
// node_modules/better-auth/dist/auth/trusted-origins.mjs). Loopback origins
// across any port are allowed so dev (Vite at :5173/:5174/:4173, electron
// loopback OAuth at :random_port) and prod (where these addresses are
// unreachable) share the same config. The pattern is intentionally broad —
// loopback is unreachable from the public internet, so any origin that
// resolves to localhost is by definition the same machine the user is on.
//
// Removal condition: when dev serves UI from the same origin as the API
// (e.g. via vite proxy or static mount), drop these entries.
const ALWAYS_TRUSTED_AUTH_ORIGINS = [
  'http://localhost:*',
  'http://127.0.0.1:*',
]

/**
 * Builds the origin list passed to Better Auth `trustedOrigins` (and related flows).
 *
 * Expects:
 * - Public Auth server URL and parsed `env.ADDITIONAL_TRUSTED_ORIGINS`.
 * - Optional `request` so the caller's Origin/Referer can be merged when known.
 *
 * Returns:
 * - De-duplicated origins in insertion order (Auth URL, env extras, localhost wildcards, then request-derived).
 */
export function getAuthTrustedOrigins(
  env: { PUBLIC_URL: string, ADDITIONAL_TRUSTED_ORIGINS: readonly string[] },
  request?: Request,
): string[] {
  const origins = new Set<string>()
  const authServerOrigin = getOriginFromUrl(env.PUBLIC_URL)
  if (authServerOrigin) {
    origins.add(authServerOrigin)
  }

  for (const origin of TRUSTED_AUTH_CALLBACK_ORIGINS) {
    origins.add(origin)
  }
  origins.add('https://appleid.apple.com')

  for (const origin of env.ADDITIONAL_TRUSTED_ORIGINS) {
    origins.add(origin)
  }

  for (const origin of ALWAYS_TRUSTED_AUTH_ORIGINS) {
    origins.add(origin)
  }

  if (request) {
    const requestOrigin = resolveTrustedRequestOrigin(request, env.ADDITIONAL_TRUSTED_ORIGINS)
    if (requestOrigin) {
      origins.add(requestOrigin)
    }
  }

  return [...origins]
}
