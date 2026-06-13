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
import { authenticateUserTicket, checkAppOwnership } from '../../../libs/steam-web-api'
import { user } from '../../../schemas/accounts'
import { resolveOrCreateSteamUser } from '../../../services/domain/steam-auth/resolve-steam-user'
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

export interface SteamDesktopSignInRouteDeps {
  auth: AuthInstance
  db: Database
  env: Env
}

export function createSteamDesktopSignInRoute(deps: SteamDesktopSignInRouteDeps) {
  return new Hono<HonoEnv>()
    .post('/desktop-sign-in', async (c) => {
      if (!deps.env.STEAM_PUBLISHER_KEY?.trim())
        throw createServiceUnavailableError('Steam sign-in is not configured', 'STEAM_NOT_CONFIGURED')

      const parsed = v.safeParse(DesktopSignInBodySchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        throw createBadRequestError('Invalid request body', 'INVALID_TICKET')

      const appId = deps.env.STEAM_APP_ID

      let steamId: string
      try {
        steamId = await authenticateUserTicket({
          publisherKey: deps.env.STEAM_PUBLISHER_KEY,
          appId,
          ticketHex: parsed.output.ticket,
          identity: deps.env.STEAM_WEB_API_IDENTITY,
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
        ownsApp = await checkAppOwnership({
          publisherKey: deps.env.STEAM_PUBLISHER_KEY,
          steamId,
          appId,
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

      const { userId } = await resolveOrCreateSteamUser(deps.db, steamId)

      const [userForBanCheck] = await deps.db
        .select({ banned: user.banned, banExpires: user.banExpires })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)

      if (userForBanCheck && isUserBannedNow(userForBanCheck))
        throw createForbiddenError('This account has been banned')

      const tokens = await mintElectronOidcTokens({
        auth: deps.auth,
        env: deps.env,
        userId,
      })

      return c.json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        expiresIn: tokens.expiresIn,
      })
    })
}
