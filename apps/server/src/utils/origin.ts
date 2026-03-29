import type { Env } from '../libs/env'

function getOriginFromUrl(url: string): string | undefined {
  try {
    return new URL(url).origin
  }
  catch {
    return undefined
  }
}

export function getTrustedOrigin(origin: string): string {
  // 1. Allow Dev (Localhost with any port)
  if (!origin || origin.startsWith('http://localhost:')) {
    return origin
  }

  // 2. Allow Capacitor mobile app origins (iOS: capacitor://, Android: http://localhost)
  if (origin === 'capacitor://localhost') {
    return origin
  }

  // 3. Allow Production (Exact Match)
  if (origin === 'https://airi.moeru.ai') {
    return origin
  }

  // 4. Allow Dynamic Subdomains (Strict Regex)
  // Matches: https://foo.kwaa.workers.dev
  if (/^https:\/\/.*\.kwaa\.workers\.dev$/.test(origin)) {
    return origin
  }

  // Default: Block
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
