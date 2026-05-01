import type { Env } from '../libs/env'

function getOriginFromUrl(url: string): string | undefined {
  try {
    return new URL(url).origin
  }
  catch {
    return undefined
  }
}

const TRUSTED_EXACT_ORIGINS = [
  'capacitor://localhost', // Capacitor mobile (iOS)
  'https://airi.moeru.ai', // Production
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
 * - `additionalTrustedOrigins` entries are normalized origins (see {@link parseAdditionalTrustedOriginsEnv}).
 *
 * Returns:
 * - The same origin string when trusted, or `''` when not trusted.
 */
export function getTrustedOrigin(origin: string, additionalTrustedOrigins: readonly string[] = []): string {
  let resolved: string
  if (!origin)
    resolved = origin
  else if (TRUSTED_EXACT_ORIGINS.includes(origin))
    resolved = origin
  else if (additionalTrustedOrigins.includes(origin))
    resolved = origin
  else if (TRUSTED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin)))
    resolved = origin
  else
    resolved = ''

  return resolved
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
 * - `env.API_SERVER_URL` and parsed `env.ADDITIONAL_TRUSTED_ORIGINS`.
 * - Optional `request` so the caller's Origin/Referer can be merged when known.
 *
 * Returns:
 * - De-duplicated origins in insertion order (API URL, env extras, localhost wildcards, then request-derived).
 */
export function getAuthTrustedOrigins(
  env: Pick<Env, 'API_SERVER_URL' | 'ADDITIONAL_TRUSTED_ORIGINS'>,
  request?: Request,
): string[] {
  const origins = new Set<string>()
  const apiServerOrigin = getOriginFromUrl(env.API_SERVER_URL)
  if (apiServerOrigin) {
    origins.add(apiServerOrigin)
  }

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
