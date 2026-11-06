/**
 * Checks whether a URL is on a loopback host, `localhost` or `127.0.0.1`, over `http` or `https`, with any port.
 *
 * Local development serves the auth UI, the admin UI, and the API server on these hosts. Callers trust such a URL
 * as a redirect target or an API server, because it can only reach the machine of the user.
 */
export function isLoopbackUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return false
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
}
