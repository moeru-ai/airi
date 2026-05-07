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
  'ai.moeru.airi_pocket://links', // Android deep link
  'https://airi.moeru.ai', // Production
]

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

export function getTrustedOrigin(origin: string): string {
  if (!origin)
    return origin

  if (TRUSTED_EXACT_ORIGINS.includes(origin))
    return origin

  if (TRUSTED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin)))
    return origin

  return ''
}

export function resolveTrustedRequestOrigin(request: Request): string | undefined {
  const refererOrigin = getOriginFromUrl(request.headers.get('referer') ?? '')
  if (refererOrigin) {
    const trustedRefererOrigin = getTrustedOrigin(refererOrigin)
    if (trustedRefererOrigin) {
      return trustedRefererOrigin
    }
  }

  const requestOrigin = request.headers.get('origin') ?? ''
  const trustedRequestOrigin = getTrustedOrigin(requestOrigin)
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

export function getAuthTrustedOrigins(env: Pick<Env, 'API_SERVER_URL'>, request?: Request): string[] {
  const origins = new Set<string>()
  const apiServerOrigin = getOriginFromUrl(env.API_SERVER_URL)
  if (apiServerOrigin) {
    origins.add(apiServerOrigin)
  }

  for (const origin of ALWAYS_TRUSTED_AUTH_ORIGINS) {
    origins.add(origin)
  }

  if (request) {
    const requestOrigin = resolveTrustedRequestOrigin(request)
    if (requestOrigin) {
      origins.add(requestOrigin)
    }
  }

  return [...origins]
}
