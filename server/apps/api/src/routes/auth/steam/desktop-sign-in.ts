import type { AuthInstance } from '../../../libs/auth'
import type { Database } from '../../../libs/db'
import type { Env } from '../../../libs/env'
import type { HonoEnv } from '../../../types/hono'

import { errorMessageFrom } from '@moeru/std'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import * as v from 'valibot'

import { resolveOrCreateSteamUser } from '../../../libs/auth-plugins/steam'
import { isUserBannedNow } from '../../../libs/request-auth'
import { issueElectronOidcCode } from '../../../libs/steam-oidc-tokens'
import { authenticateUserTicket, checkAppOwnership } from '../../../libs/steam-web-api'
import { user } from '../../../schemas/accounts'
import {
  createBadRequestError,
  createForbiddenError,
  createServiceUnavailableError,
  createUnauthorizedError,
} from '../../../utils/error'

/** S256 code_challenge is base64url(SHA-256(...)) without padding — always 43 chars. */
const CodeChallengeSchema = v.pipe(
  v.string(),
  v.nonEmpty('code_challenge is required'),
  v.regex(/^[\w-]{43}$/, 'code_challenge must be a S256 base64url digest'),
)

const DesktopSignInBodySchema = v.object({
  ticket: v.pipe(
    v.string(),
    v.nonEmpty('ticket is required'),
    v.regex(/^[0-9a-f]+$/i, 'ticket must be hex-encoded'),
  ),
  code_challenge: CodeChallengeSchema,
  code_challenge_method: v.literal('S256'),
})

const STEAM_APP_ID = '3885340'

interface SteamDesktopSignInRouteDeps {
  auth: AuthInstance
  db: Database
  env: Env
  collaborators?: Partial<{
    authenticateUserTicket: typeof authenticateUserTicket
    checkAppOwnership: typeof checkAppOwnership
    resolveOrCreateSteamUser: typeof resolveOrCreateSteamUser
    issueElectronOidcCode: typeof issueElectronOidcCode
  }>
}

/**
 * Desktop Steam ticket sign-in: `POST /api/auth/steam/desktop-sign-in`.
 *
 * Use when:
 * - Electron already launched through Steam and holds a Web API session
 *   ticket. This route verifies the ticket, checks app ownership (anti-fraud
 *   only the ticket path can do — the browser OpenID plugin has no ticket),
 *   then resolves or creates the AIRI user for that SteamID via the same
 *   `internalAdapter`-based policy the OpenID plugin's callback uses, and
 *   bridges straight into a real OIDC authorization code.
 *
 * Mechanism:
 * - There is no separate "unlinked" outcome: a brand-new SteamID gets a
 *   brand-new AIRI user immediately (via {@link resolveOrCreateSteamUser}),
 *   matching how the OpenID plugin already behaves for browser sign-ins.
 *   Ticket verification + `CheckAppOwnership` already prove Steam identity
 *   and app ownership server-side, so there is no need to detour through an
 *   email-enrollment step the way a browser-only sign-in would.
 */
export function createSteamDesktopSignInRoute(deps: SteamDesktopSignInRouteDeps) {
  const collaborators = {
    authenticateUserTicket,
    checkAppOwnership,
    resolveOrCreateSteamUser,
    issueElectronOidcCode,
    ...deps.collaborators,
  }

  return new Hono<HonoEnv>()
    .post('/desktop-sign-in', async (c) => {
      if (!deps.env.STEAM_PUBLISHER_KEY?.trim())
        throw createServiceUnavailableError('Steam sign-in is not configured', 'STEAM_NOT_CONFIGURED')

      const parsed = v.safeParse(DesktopSignInBodySchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        throw createBadRequestError('Invalid request body', 'INVALID_REQUEST')

      let steamId: string
      try {
        steamId = await collaborators.authenticateUserTicket({
          publisherKey: deps.env.STEAM_PUBLISHER_KEY,
          appId: STEAM_APP_ID,
          ticketHex: parsed.output.ticket,
        })
      }
      catch (error) {
        throw createUnauthorizedError(
          errorMessageFrom(error) ?? 'Steam ticket validation failed',
          'STEAM_TICKET_INVALID',
        )
      }

      let ownsApp: boolean
      try {
        ownsApp = await collaborators.checkAppOwnership({
          publisherKey: deps.env.STEAM_PUBLISHER_KEY,
          steamId,
          appId: STEAM_APP_ID,
        })
      }
      catch (error) {
        throw createServiceUnavailableError(
          errorMessageFrom(error) ?? 'Steam ownership check failed',
          'STEAM_API_UNAVAILABLE',
        )
      }

      if (!ownsApp)
        throw createForbiddenError('Steam account does not own this app', 'STEAM_NO_OWNERSHIP')

      const ctx = await deps.auth.$context
      const { userId } = await collaborators.resolveOrCreateSteamUser(ctx.internalAdapter, steamId)

      const [userForBanCheck] = await deps.db
        .select({ banned: user.banned, banExpires: user.banExpires })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)

      if (userForBanCheck && isUserBannedNow(userForBanCheck))
        throw createForbiddenError('This account has been banned')

      const code = await collaborators.issueElectronOidcCode({
        auth: deps.auth,
        env: deps.env,
        userId,
        codeChallenge: parsed.output.code_challenge,
      })

      return c.json({ code })
    })
}
