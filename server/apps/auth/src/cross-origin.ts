import type { MiddlewareHandler } from 'hono'

import type { HonoEnv } from './routes'

import { resolveCrossOriginHeaders } from '@proj-airi/auth-shared'

/**
 * Applies the cross-origin policy of `@proj-airi/auth-shared` to Auth.
 *
 * Only `credentialedOrigin`, the origin of the Auth UI, gets its own origin and credentials.
 * Stage clients send bearer tokens, so every other origin gets `*`.
 * A preflight ends here with status 204. Other requests get the headers after the route runs,
 * so Better Auth responses and error responses also get them.
 */
export function crossOrigin(options: { credentialedOrigin: string }): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const { preflight, headers } = resolveCrossOriginHeaders({
      method: c.req.method,
      origin: c.req.header('Origin'),
      requestMethod: c.req.header('Access-Control-Request-Method'),
      requestHeaders: c.req.header('Access-Control-Request-Headers'),
      credentialedOrigin: options.credentialedOrigin,
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
