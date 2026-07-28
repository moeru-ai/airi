import type { AuthInstance } from '../../../libs/auth'
import type { Database } from '../../../libs/db'
import type { Env } from '../../../libs/env'
import type { HonoEnv } from '../../../types/hono'

import { errorMessageFrom } from '@moeru/std'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import * as v from 'valibot'

import { isUserBannedNow } from '../../../libs/request-auth'
import { issueElectronOidcCode } from '../../../libs/steam-oidc-tokens'
import { authenticateUserTicket, checkAppOwnership, getPlayerSummaries } from '../../../libs/steam-web-api'
import { user } from '../../../schemas/accounts'
import { createEnrollmentToken } from '../../../services/domain/steam-auth/enrollment-token'
import { findLinkedSteamUser } from '../../../services/domain/steam-auth/resolve-steam-user'
import { resolveAuthUiUrl } from '../../../utils/auth-ui'
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
    getPlayerSummaries: typeof getPlayerSummaries
    findLinkedSteamUser: typeof findLinkedSteamUser
    createEnrollmentToken: typeof createEnrollmentToken
    issueElectronOidcCode: typeof issueElectronOidcCode
  }>
}

export function createSteamDesktopSignInRoute(deps: SteamDesktopSignInRouteDeps) {
  const collaborators = {
    authenticateUserTicket,
    checkAppOwnership,
    getPlayerSummaries,
    findLinkedSteamUser,
    createEnrollmentToken,
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

      const linked = await collaborators.findLinkedSteamUser(deps.db, steamId)
      if (!linked) {
        // Unlinked steamId: do NOT create a user/account. Hand the browser a
        // single-use enrollment token so the user can verify a real email or
        // sign in to an existing account before Steam is linked at authorize.
        // code_challenge is required for a uniform request shape but unused here.
        const profile = await collaborators.getPlayerSummaries({ publisherKey: deps.env.STEAM_PUBLISHER_KEY, steamId })
        const enrollToken = await collaborators.createEnrollmentToken(deps.db, { steamId, profile })
        const authUiUrl = resolveAuthUiUrl(deps.env.AUTH_UI_URL, deps.env.API_SERVER_URL)
        return c.json({ errorCode: 'STEAM_NEEDS_ENROLLMENT', enrollToken, authUiUrl }, 403)
      }

      const { userId } = linked

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
