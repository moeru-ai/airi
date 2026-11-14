/** The methods that a preflight allows. Every AIRI route uses one of them. */
const ALLOWED_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'

/** Chromium caps a preflight cache entry at two hours, so a longer value has no effect. */
const PREFLIGHT_MAX_AGE_SECONDS = '7200'

export interface CrossOriginRequest {
  /** The HTTP method of the request. */
  method: string
  /** The raw `Origin` header. A missing header and the opaque `null` origin get the bearer policy. */
  origin?: string
  /** The raw `Access-Control-Request-Method` header. An `OPTIONS` request with it is a preflight. */
  requestMethod?: string
  /** The raw `Access-Control-Request-Headers` header of a preflight. The preflight reflects it. */
  requestHeaders?: string
  /**
   * The origin of the one UI that sends cookies to this service.
   * Only this origin gets its own origin back and `Access-Control-Allow-Credentials: true`.
   * Omit it for a service that reads no cookies.
   */
  credentialedOrigin?: string
  /** The response headers that clients read. They go to `Access-Control-Expose-Headers` on actual responses. */
  exposeHeaders?: readonly string[]
}

export interface CrossOriginHeaders {
  /**
   * `true` for an `OPTIONS` request with `Access-Control-Request-Method`.
   * The caller then answers with status 204 and no body, and does not run the route.
   */
  preflight: boolean
  /**
   * The headers to set on the response.
   * `Vary` names the request headers that changed the result. Append it to a `Vary` that the route sets.
   */
  headers: Record<string, string>
}

/**
 * Resolves the cross-origin headers of one request.
 *
 * The credential that a request carries decides the policy. A bearer request
 * carries no ambient credential, so every origin gets `Access-Control-Allow-Origin: *`.
 * Only `credentialedOrigin` gets its own origin and `Allow-Credentials: true`.
 * A browser does not show a credentialed response that has `*`, so the wildcard
 * gives no other origin access to cookies. CSRF protection for cookie routes stays in the service.
 *
 * See `server/docs/ai/adr/2026-11-07-cross-origin-boundary.md`.
 *
 * @example
 * resolveCrossOriginHeaders({ method: 'GET', origin: 'capacitor://localhost' })
 * // => { preflight: false, headers: { 'Access-Control-Allow-Origin': '*' } }
 */
export function resolveCrossOriginHeaders(request: CrossOriginRequest): CrossOriginHeaders {
  const headers: Record<string, string> = {}
  const vary: string[] = []
  const preflight = request.method === 'OPTIONS' && request.requestMethod !== undefined

  // A service with a credentialed origin sends a different `Allow-Origin` to that
  // origin, so a cache must key every response by `Origin`, also a response without one.
  if (request.credentialedOrigin) {
    vary.push('Origin')
  }

  if (request.credentialedOrigin && request.origin === request.credentialedOrigin) {
    headers['Access-Control-Allow-Origin'] = request.origin
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  else {
    headers['Access-Control-Allow-Origin'] = '*'
  }

  if (preflight) {
    headers['Access-Control-Allow-Methods'] = ALLOWED_METHODS
    headers['Access-Control-Max-Age'] = PREFLIGHT_MAX_AGE_SECONDS
    // Reflecting the requested headers lets each client send its own headers without a list here.
    if (request.requestHeaders) {
      headers['Access-Control-Allow-Headers'] = request.requestHeaders
    }
    vary.push('Access-Control-Request-Headers')
  }
  else if (request.exposeHeaders?.length) {
    headers['Access-Control-Expose-Headers'] = request.exposeHeaders.join(', ')
  }

  if (vary.length > 0) {
    headers.Vary = vary.join(', ')
  }

  return { preflight, headers }
}
