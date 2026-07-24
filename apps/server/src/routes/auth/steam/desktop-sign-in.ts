import type { AuthInstance } from '../../../libs/auth'
import type { Database } from '../../../libs/db'
import type { Env } from '../../../libs/env'
import type { HonoEnv } from '../../../types/hono'

import { errorMessageFrom } from '@moeru/std'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import * as v from 'valibot'

import { isUserBannedNow } from '../../../libs/request-auth'
import { mintElectronOidcTokens } from '../../../libs/steam-oidc-tokens'
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

const DesktopSignInBodySchema = v.object({
  ticket: v.pipe(
    v.string(),
    v.nonEmpty('ticket is required'),
    v.regex(/^[0-9a-f]+$/i, 'ticket must be hex-encoded'),
  ),
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
    mintElectronOidcTokens: typeof mintElectronOidcTokens
  }>
}

export function createSteamDesktopSignInRoute(deps: SteamDesktopSignInRouteDeps) {
  const collaborators = {
    authenticateUserTicket,
    checkAppOwnership,
    getPlayerSummaries,
    findLinkedSteamUser,
    createEnrollmentToken,
    mintElectronOidcTokens,
    ...deps.collaborators,
  }

  return new Hono<HonoEnv>()
    .post('/desktop-sign-in', async (c) => {
      if (!deps.env.STEAM_PUBLISHER_KEY?.trim())
        throw createServiceUnavailableError('Steam sign-in is not configured', 'STEAM_NOT_CONFIGURED')

      const parsed = v.safeParse(DesktopSignInBodySchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        throw createBadRequestError('Invalid request body', 'INVALID_TICKET')

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
        const profile = await collaborators.getPlayerSummaries({ publisherKey: deps.env.STEAM_PUBLISHER_KEY, steamId })
        const enrollToken = await collaborators.createEnrollmentToken(deps.db, { steamId, profile })
        const authUiUrl = resolveAuthUiUrl(deps.env.AUTH_UI_URL, deps.env.API_SERVER_URL)
        // #region agent log
        let authUiHost = ''
        try {
          authUiHost = new URL(authUiUrl).host
        }
        catch {
          authUiHost = 'invalid'
        }
        console.info('[airi-debug:af8d97]', 'desktop-sign-in:needs_enrollment', {
          caseId: 'C3',
          hasEnrollToken: Boolean(enrollToken),
          authUiHost,
        })
        // #endregion
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

      const tokens = await collaborators.mintElectronOidcTokens({
        auth: deps.auth,
        env: deps.env,
        userId,
      })

      // #region agent log
      console.info('[airi-debug:af8d97]', 'desktop-sign-in:ok', { caseId: 'C8' })
      // #endregion
      return c.json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        expiresIn: tokens.expiresIn,
      })
    })
}
