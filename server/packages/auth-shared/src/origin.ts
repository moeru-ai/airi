/** The Cloudflare Workers subdomain of the moeru-ai account. Every Worker preview origin ends with it. */
const WORKERS_HOST_SUFFIX = '.moeru-ai.workers.dev'

/**
 * The first-party origins that a redirect can go to.
 *
 * This is the one redirect allowlist of the TypeScript services. Auth reads it for OIDC
 * redirect URIs and Better Auth `trustedOrigins`. The API reads it for the Stripe return base.
 * Each consumer adds `ADDITIONAL_TRUSTED_ORIGINS` and {@link matchesTrustedOriginRule}.
 * It does not decide CORS. See `server/docs/ai/adr/2026-11-07-cross-origin-boundary.md`.
 *
 * The list also has native schemes. A consumer that accepts only web origins filters them out.
 */
export const TRUSTED_ORIGINS: readonly string[] = Object.freeze([
  'https://airi.moeru.ai', // Production web app
  'capacitor://localhost', // Capacitor mobile (iOS)
  'ai.moeru.airi-pocket://links', // Android deep link
  'https://accounts.airi.build', // Standalone auth UI
  'https://server-dev.airi-server-auth.pages.dev', // Server-dev standalone auth UI
  'https://admin.airi.build', // Standalone admin UI
  'https://server-dev.airi-server-admin.pages.dev', // Server-dev standalone admin UI
])

/**
 * Checks whether an origin matches a built-in trust rule, so the API and the Auth service trust the same hosts.
 *
 * The rules are:
 * - `http` or `https` on `localhost` or `127.0.0.1`, with any port. Local development and the Electron OIDC
 *   loopback callback (RFC 8252 section 7.3) use them.
 * - `https` on a subdomain of `moeru-ai.workers.dev`, without a port.
 *
 * The input must be exactly an origin. A value with a path, a query, or a fragment is not trusted, because a raw
 * `Origin` header comes from the client and can carry text such as `https://evil.example/x.moeru-ai.workers.dev`.
 * Private LAN hosts are not matched. Callers list them in `ADDITIONAL_TRUSTED_ORIGINS`.
 *
 * @example
 * matchesTrustedOriginRule('http://localhost:5173')
 * // => true
 * matchesTrustedOriginRule('https://evil.example/x.moeru-ai.workers.dev')
 * // => false
 */
export function matchesTrustedOriginRule(origin: string): boolean {
  if (!URL.canParse(origin))
    return false

  const url = new URL(origin)
  if (url.origin !== origin)
    return false
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return false
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    return true
  return url.protocol === 'https:' && url.port === '' && url.hostname.endsWith(WORKERS_HOST_SUFFIX)
}
