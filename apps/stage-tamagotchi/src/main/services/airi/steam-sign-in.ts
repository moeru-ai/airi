import type { TokenExchangeResult } from './oidc-token-exchange'

import { errorMessageFrom } from '@moeru/std'
import { generateCodeChallenge, generateCodeVerifier } from '@proj-airi/stage-shared/auth'
import { literal, object, safeParse, string } from 'valibot'

import { electronOidcRedirectUri, exchangeAuthorizationCode } from './oidc-token-exchange'

const STEAM_NEEDS_ENROLLMENT = 'STEAM_NEEDS_ENROLLMENT'

const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-electron'

// Mirrors the 403 body from apps/server/src/routes/auth/steam/desktop-sign-in.ts.
const SteamNeedsEnrollmentBodySchema = object({
  errorCode: literal(STEAM_NEEDS_ENROLLMENT),
  enrollToken: string(),
  authUiUrl: string(),
})

const SteamAuthorizationCodeBodySchema = object({
  code: string(),
})

export type SteamExchangeResult
  = | { ok: true, tokens: TokenExchangeResult }
    | { ok: false, kind: 'error', reason: string }
    | { ok: false, kind: 'needs_enrollment', reason: string, enrollToken: string, authUiUrl: string }

/**
 * Exchanges a Steam Web API ticket for either OIDC tokens (linked steamId) or
 * an enrollment handoff (unlinked steamId).
 *
 * Linked path: client PKCE → short-lived authorization code from
 * `/desktop-sign-in` → `/oauth2/token` with the matching `code_verifier`.
 *
 * Returns:
 * - `{ ok: true, tokens }` when the steamId is linked and token exchange succeeds.
 * - `{ ok: false, kind: 'needs_enrollment', enrollToken, authUiUrl }` on a 403
 *   carrying `STEAM_NEEDS_ENROLLMENT` — caller opens the system browser.
 * - `{ ok: false, kind: 'error', reason }` for any other non-2xx or network
 *   failure — caller surfaces a toast + manual OIDC login fallback.
 */
export async function exchangeSteamTicketForTokens(params: {
  serverUrl: string
  ticketHex: string
}): Promise<SteamExchangeResult> {
  try {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const redirectUri = electronOidcRedirectUri(params.serverUrl)

    const response = await fetch(new URL('/api/auth/steam/desktop-sign-in', params.serverUrl), {
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

    if (response.status === 403) {
      const text = await response.text().catch(() => '')
      let body: unknown = null
      try {
        body = JSON.parse(text)
      }
      catch {
        body = null
      }
      const parsed = safeParse(SteamNeedsEnrollmentBodySchema, body)
      if (parsed.success) {
        return {
          ok: false,
          kind: 'needs_enrollment',
          reason: 'Steam account is not linked — enrollment required',
          enrollToken: parsed.output.enrollToken,
          authUiUrl: parsed.output.authUiUrl,
        }
      }
      return { ok: false, kind: 'error', reason: `Steam sign-in failed (403): ${text}` }
    }

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, kind: 'error', reason: `Steam sign-in failed (${response.status}): ${text}` }
    }

    const codeBody = safeParse(SteamAuthorizationCodeBodySchema, await response.json())
    if (!codeBody.success)
      return { ok: false, kind: 'error', reason: 'Steam sign-in response missing authorization code' }

    const tokens = await exchangeAuthorizationCode({
      serverUrl: params.serverUrl,
      clientId: OIDC_CLIENT_ID,
      code: codeBody.output.code,
      codeVerifier,
      redirectUri,
    })

    return { ok: true, tokens }
  }
  catch (error) {
    return {
      ok: false,
      kind: 'error',
      reason: errorMessageFrom(error) ?? 'Steam sign-in request failed',
    }
  }
}
