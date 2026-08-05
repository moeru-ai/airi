import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { generateState, parseState } from 'better-auth/oauth2'
import { ofetch } from 'ofetch'

import * as z from 'zod'

const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login'
const STEAM_OPENID_NS = 'http://specs.openid.net/auth/2.0'
const STEAM_OPENID_IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'

/** Matches `https://steamcommunity.com/openid/id/<steamid64>`. */
const STEAM_CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/

// NOTICE:
// Why Zod instead of the repo-default Valibot: better-auth's endpoint API and
// OpenAPI generator are Zod-native. The generator introspects
// `instanceof z.ZodObject` on `body`/`query` to emit request/query schemas
// (node_modules/better-auth/dist/plugins/open-api/generator.mjs), so Valibot
// schemas would validate at runtime (better-call uses Standard Schema) but
// silently drop those OpenAPI fields. Keep these schemas in Zod until
// better-auth's OpenAPI generation supports non-Zod schemas.
const SignInBodySchema = z.object({
  callbackURL: z.string().meta({ description: 'The URL to redirect to after sign in' }),
  errorCallbackURL: z.string().meta({ description: 'The URL to redirect to if an error occurs' }).optional(),
  disableRedirect: z.boolean().optional(),
})

const CallbackQuerySchema = z.looseObject({
  'state': z.string().optional(),
  'openid.mode': z.string().optional(),
})

/**
 * Steam OpenID 2.0 sign-in / account-linking plugin.
 *
 * Steam's web login is OpenID 2.0, not OAuth2/OIDC, so it can't be a
 * `socialProviders` entry — this plugin adds the endpoints its protocol
 * needs: `POST /sign-in/steam`, `POST /link/steam`, `GET /steam/callback`.
 *
 * Identity model:
 * - Steam never exposes an email address. New sign-ups get a placeholder
 *   `<steamid64>@steam.placeholder.local` (mirrors Apple's
 *   `<sub>@apple.placeholder.local`) with `emailVerified: true` — the
 *   placeholder can never receive mail, so verification is meaningless and
 *   would otherwise permanently block sign-in.
 *
 * Mechanism:
 * - Both start endpoints build the same `checkid_setup` redirect URL,
 *   differing only in whether `generateState` records a `link: { userId,
 *   email }` (link requires an active session via `sessionMiddleware`).
 *   Reusing `generateState`/`parseState` gets the same verification-table-
 *   backed CSRF state storage the built-in OAuth2 plugins use, without
 *   re-implementing it.
 * - `GET /steam/callback` verifies via OpenID "dumb mode"
 *   (`openid.mode=check_authentication`, POSTed back to Steam) instead of
 *   validating the RSA signature ourselves — no association/session state
 *   to manage, at the cost of one extra HTTP round trip per login.
 */
export function steam() {
  function buildOpenIdRedirectURL(baseURL: string, state: string): string {
    const returnTo = new URL(`${baseURL}/steam/callback`)
    returnTo.searchParams.set('state', state)

    const redirectURL = new URL(STEAM_OPENID_ENDPOINT)
    redirectURL.searchParams.set('openid.ns', STEAM_OPENID_NS)
    redirectURL.searchParams.set('openid.mode', 'checkid_setup')
    redirectURL.searchParams.set('openid.return_to', returnTo.toString())
    redirectURL.searchParams.set('openid.realm', new URL(baseURL).origin)
    redirectURL.searchParams.set('openid.identity', STEAM_OPENID_IDENTIFIER_SELECT)
    redirectURL.searchParams.set('openid.claimed_id', STEAM_OPENID_IDENTIFIER_SELECT)
    return redirectURL.toString()
  }

  /**
   * Verifies a Steam OpenID callback via "dumb mode": relay every
   * `openid.*` field Steam sent us back to Steam with `mode` swapped to
   * `check_authentication`, and trust its `is_valid:true` verdict instead of
   * checking the RSA signature ourselves.
   */
  async function verifyOpenIdCallback(query: Record<string, string>): Promise<boolean> {
    const verifyParams = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('openid.'))
        verifyParams.set(key, value)
    }
    verifyParams.set('openid.mode', 'check_authentication')

    try {
      const body = await ofetch<string, 'text'>(STEAM_OPENID_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyParams.toString(),
        responseType: 'text',
      })
      return body.split('\n').some(line => line.trim() === 'is_valid:true')
    }
    catch {
      // Steam unreachable or non-2xx: the callback cannot proceed anyway, so
      // collapse it into a verification failure and let the caller's error
      // redirect handle it instead of surfacing a second exception.
      return false
    }
  }

  const signInSteam = createAuthEndpoint('/sign-in/steam', {
    method: 'POST',
    body: SignInBodySchema,
    metadata: {
      openapi: {
        description: 'Start Steam OpenID sign-in',
        responses: {
          200: {
            description: 'Redirect URL to Steam OpenID login',
            content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' }, redirect: { type: 'boolean' } } } } },
          },
        },
      },
    },
  }, async (ctx) => {
    const { state } = await generateState(ctx, undefined, undefined)
    return ctx.json({
      url: buildOpenIdRedirectURL(ctx.context.baseURL, state),
      redirect: !ctx.body.disableRedirect,
    })
  })

  const linkSteam = createAuthEndpoint('/link/steam', {
    method: 'POST',
    body: SignInBodySchema,
    use: [sessionMiddleware],
    metadata: {
      openapi: {
        description: 'Link the current user to a Steam account',
        responses: {
          200: {
            description: 'Redirect URL to Steam OpenID login',
            content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' }, redirect: { type: 'boolean' } } } } },
          },
        },
      },
    },
  }, async (ctx) => {
    const session = ctx.context.session
    const { state } = await generateState(ctx, { userId: session.user.id, email: session.user.email }, undefined)
    return ctx.json({
      url: buildOpenIdRedirectURL(ctx.context.baseURL, state),
      redirect: !ctx.body.disableRedirect,
    })
  })

  const steamCallback = createAuthEndpoint('/steam/callback', {
    method: 'GET',
    query: CallbackQuerySchema,
    metadata: {
      openapi: {
        description: 'Steam OpenID callback',
        responses: { 200: { description: 'Redirects to callbackURL or errorURL' } },
      },
    },
  }, async (ctx) => {
    const parsedState = await parseState(ctx)
    const callbackURL = parsedState.callbackURL
    // `parseState` always backfills this with `${baseURL}/error` when the
    // sign-in/link request didn't supply one (better-auth/dist/oauth2/state.mjs);
    // the `?` in its type only reflects the pre-backfill shape.
    const errorURL = parsedState.errorURL ?? `${ctx.context.baseURL}/error`
    const link = parsedState.link

    function redirectOnError(error: string): never {
      const url = errorURL.includes('?') ? `${errorURL}&error=${error}` : `${errorURL}?error=${error}`
      throw ctx.redirect(url)
    }

    if (ctx.query['openid.mode'] !== 'id_res')
      return redirectOnError('steam_openid_denied')

    const isValid = await verifyOpenIdCallback(ctx.query as Record<string, string>)
    if (!isValid)
      return redirectOnError('steam_openid_verification_failed')

    const claimedId = ctx.query['openid.claimed_id'] as string | undefined
    const steamId = claimedId ? (STEAM_CLAIMED_ID_PATTERN.exec(claimedId)?.[1] ?? null) : null
    if (!steamId)
      return redirectOnError('steam_claimed_id_missing')

    const existingAccount = await ctx.context.internalAdapter.findAccountByProviderId(steamId, 'steam')

    if (link) {
      if (existingAccount && existingAccount.userId !== link.userId)
        return redirectOnError('account_already_linked_to_different_user')

      if (!existingAccount) {
        await ctx.context.internalAdapter.linkAccount({
          userId: link.userId,
          providerId: 'steam',
          accountId: steamId,
        })
      }
      throw ctx.redirect(callbackURL)
    }

    let userId: string
    if (existingAccount) {
      userId = existingAccount.userId
    }
    else {
      const { user } = await ctx.context.internalAdapter.createOAuthUser(
        {
          email: `${steamId}@steam.placeholder.local`,
          emailVerified: true,
          name: `Steam User ${steamId}`,
        },
        { providerId: 'steam', accountId: steamId },
      )
      userId = user.id
    }

    const user = await ctx.context.internalAdapter.findUserById(userId)
    if (!user)
      return redirectOnError('steam_user_not_found')

    const newSession = await ctx.context.internalAdapter.createSession(userId)
    await setSessionCookie(ctx, { session: newSession, user })
    throw ctx.redirect(callbackURL)
  })

  return {
    id: 'steam',
    endpoints: {
      signInSteam,
      linkSteam,
      steamCallback,
    },
  }
}
