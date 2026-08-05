import type { AuthInstance } from '../../../libs/auth'
import type { Env } from '../../../libs/env'
import type { HonoEnv } from '../../../types/hono'

import { errorMessageFrom } from '@moeru/std'
import { Hono } from 'hono'

import * as v from 'valibot'

import { resolveOrCreateSteamUser } from '../../../libs/auth-plugins/steam'
import { issueElectronOidcCode } from '../../../libs/electron-oidc-code'
import { authenticateUserTicket } from '../../../libs/steam-web-api'
import {
  createBadRequestError,
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

interface SteamDesktopSignInRouteDeps {
  auth: AuthInstance
  env: Env
  collaborators?: Partial<{
    authenticateUserTicket: typeof authenticateUserTicket
    issueElectronOidcCode: typeof issueElectronOidcCode
  }>
}

/**
 * Desktop Steam ticket sign-in: `POST /api/auth/steam/desktop-sign-in`.
 *
 * Use when:
 * - Electron already launched through Steam and holds a Web API session
 *   ticket. This route verifies the ticket, then resolves or creates the
 *   AIRI user for that SteamID via the same `internalAdapter`-based policy
 *   the OpenID plugin's callback uses, and bridges straight into a real
 *   OIDC authorization code.
 *
 * Mechanism:
 * - There is no separate "unlinked" outcome: a brand-new SteamID gets a
 *   brand-new AIRI user immediately (via {@link resolveOrCreateSteamUser}),
 *   matching how the OpenID plugin already behaves for browser sign-ins.
 *   Ticket verification proves Steam identity server-side. Banned users are
 *   rejected inside {@link issueElectronOidcCode} (this path mints a session
 *   outside better-auth HTTP endpoints, so the admin `session.create.before`
 *   hook often has no `ctx` and would otherwise skip the ban check).
 */
export function createSteamDesktopSignInRoute(deps: SteamDesktopSignInRouteDeps) {
  const collaborators = {
    authenticateUserTicket,
    issueElectronOidcCode,
    ...deps.collaborators,
  }

  return new Hono<HonoEnv>()
    .post('/desktop-sign-in', async (c) => {
      const { STEAM_APP_ID, STEAM_PUBLISHER_KEY } = deps.env
      if (!STEAM_PUBLISHER_KEY?.trim() || !STEAM_APP_ID?.trim())
        throw createServiceUnavailableError('Steam sign-in is not configured', 'STEAM_NOT_CONFIGURED')

      const parsed = v.safeParse(DesktopSignInBodySchema, await c.req.json().catch(() => null))
      if (!parsed.success)
        throw createBadRequestError('Invalid request body', 'INVALID_REQUEST')

      let steamId: string
      try {
        steamId = await collaborators.authenticateUserTicket({
          publisherKey: STEAM_PUBLISHER_KEY,
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

      const ctx = await deps.auth.$context
      const { userId } = await resolveOrCreateSteamUser(ctx.internalAdapter, steamId)

      const code = await collaborators.issueElectronOidcCode({
        auth: deps.auth,
        env: deps.env,
        userId,
        codeChallenge: parsed.output.code_challenge,
      })

      return c.json({ code })
    })
}
