import type { TokenExchangeResult } from './oidc-token-exchange'

import { errorMessageFrom } from '@moeru/std'
import { generateCodeChallenge, generateCodeVerifier, oidcClientId } from '@proj-airi/stage-shared/auth'
import { ofetch } from 'ofetch'
import { object, safeParse, string } from 'valibot'

import { exchangeAuthorizationCode } from './oidc-token-exchange'

const SteamAuthorizationCodeBodySchema = object({
  code: string(),
})

export type SteamExchangeResult
  = | { ok: true, tokens: TokenExchangeResult }
    | { ok: false, reason: string }

/**
 * Exchanges a Steam Web API ticket for OIDC tokens.
 *
 * The server verifies the ticket, resolves or creates the AIRI user for that
 * SteamID, and returns a short-lived authorization code bound to
 * `code_challenge` — this then completes the same client PKCE →
 * `/oauth2/token` exchange the browser loopback flow uses.
 */
export async function exchangeSteamTicketForTokens(params: {
  serverUrl: string
  ticketHex: string
}): Promise<SteamExchangeResult> {
  try {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    const response = await ofetch<unknown>(new URL('/api/auth/steam/desktop-sign-in', params.serverUrl).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Airi-Client': 'stage-tamagotchi',
      },
      body: JSON.stringify({
        ticket: params.ticketHex,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }),
    })
    const codeBody = safeParse(SteamAuthorizationCodeBodySchema, response)
    if (!codeBody.success)
      return { ok: false, reason: 'Steam sign-in response missing authorization code' }

    const tokens = await exchangeAuthorizationCode({
      serverUrl: params.serverUrl,
      clientId: oidcClientId,
      code: codeBody.output.code,
      codeVerifier,
    })

    return { ok: true, tokens }
  }
  catch (error) {
    return {
      ok: false,
      reason: errorMessageFrom(error) ?? 'Steam sign-in request failed',
    }
  }
}
