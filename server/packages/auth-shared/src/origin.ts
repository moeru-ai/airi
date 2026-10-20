/** The Cloudflare Workers subdomain of the moeru-ai account. Every Worker preview origin ends with it. */
const WORKERS_HOST_SUFFIX = '.moeru-ai.workers.dev'

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
