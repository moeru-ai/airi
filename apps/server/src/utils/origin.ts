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

const TRUSTED_ORIGIN_PATTERNS = [
  // Localhost dev (any port)
  /^http:\/\/localhost(:\d+)?$/,
  // Loopback interface for Electron OIDC callbacks (RFC 8252 S7.3)
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
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

export function getAuthTrustedOrigins(env: Pick<Env, 'API_SERVER_URL'>, request?: Request): string[] {
  const origins = new Set<string>()
  const apiServerOrigin = getOriginFromUrl(env.API_SERVER_URL)
  if (apiServerOrigin) {
    origins.add(apiServerOrigin)
  }

  if (request) {
    const requestOrigin = resolveTrustedRequestOrigin(request)
    if (requestOrigin) {
      origins.add(requestOrigin)
    }
  }

  return [...origins]
}
