import type { MiddlewareHandler } from 'hono'

import type { HonoEnv } from '../types/hono'

import { resolveCrossOriginHeaders } from '@proj-airi/auth-shared'

/**
 * Applies the bearer cross-origin policy of `@proj-airi/auth-shared` to the API.
 *
 * The API reads no cookies, so it has no credentialed origin and every origin gets `*`.
 * A preflight ends here with status 204. Other requests get the headers after the route runs,
 * so error responses and raw `Response` objects from routes also get them.
 */
export function crossOrigin(options: { exposeHeaders: readonly string[] }): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const { preflight, headers } = resolveCrossOriginHeaders({
      method: c.req.method,
      origin: c.req.header('Origin'),
      requestMethod: c.req.header('Access-Control-Request-Method'),
      requestHeaders: c.req.header('Access-Control-Request-Headers'),
      exposeHeaders: options.exposeHeaders,
    })

    if (preflight)
      return c.body(null, 204, headers)

    await next()
    for (const [name, value] of Object.entries(headers)) {
      // A route can vary by its own request headers. Keep them.
      if (name === 'Vary')
        c.res.headers.append(name, value)
      else
        c.res.headers.set(name, value)
    }
  }
}
