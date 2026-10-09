import type { BetterAuthPlugin } from 'better-auth'

import { createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'

import * as z from 'zod'

import { authorizeHandoffTarget } from './session-handoff-target'

const HandoffQuerySchema = z.object({
  token: z.string().min(1),
  next: z.string().min(1),
})

/**
 * Plants the Better Auth session cookie during a top-level navigation.
 *
 * Email sign-in from the standalone auth UI is a cross-site fetch when the
 * UI host and the API host do not share a site (server-dev Pages vs Railway).
 * Mobile Safari drops the Set-Cookie on that fetch, so the following
 * /oauth2/authorize request looks logged out and the UI returns to the email
 * step. A top-level GET to this route is first-party for the API host, so
 * SameSite=Lax can stick before authorize runs.
 */
export function sessionHandoff(): BetterAuthPlugin {
  const handoff = createAuthEndpoint('/session-handoff', {
    method: 'GET',
    query: HandoffQuerySchema,
    metadata: {
      openapi: {
        description: 'Set the session cookie from a sign-in token and continue to OAuth authorize',
      },
    },
  }, async (ctx) => {
    const next = authorizeHandoffTarget(ctx.query.next, ctx.context.baseURL)
    if (!next)
      throw ctx.redirect('/auth/sign-in')

    const found = await ctx.context.internalAdapter.findSession(ctx.query.token)
    const expiresAt = found?.session?.expiresAt ? new Date(found.session.expiresAt) : null
    if (!found?.session || !found.user || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt < new Date())
      throw ctx.redirect('/auth/sign-in')

    await setSessionCookie(ctx, { session: found.session, user: found.user })
    throw ctx.redirect(next)
  })

  return {
    id: 'session-handoff',
    endpoints: { handoff },
  }
}
