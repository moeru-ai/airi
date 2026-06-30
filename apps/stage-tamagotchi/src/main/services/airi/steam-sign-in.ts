import type { TokenExchangeResult } from './auth'

import { errorMessageFrom } from '@moeru/std'

const STEAM_NEEDS_ENROLLMENT = 'STEAM_NEEDS_ENROLLMENT'

export type SteamExchangeResult
  = | { ok: true, tokens: TokenExchangeResult }
    | { ok: false, kind: 'error', reason: string }
    | { ok: false, kind: 'needs_enrollment', reason: string, enrollToken: string, authUiUrl: string }

/**
 * Exchanges a Steam Web API ticket for either OIDC tokens (linked steamId) or
 * an enrollment handoff (unlinked steamId).
 *
 * Use when:
 * - The Electron Steam sign-in flow has obtained a Web API ticket and needs to
 *   know whether to silently log in or open the enrollment page.
 *
 * Returns:
 * - `{ ok: true, tokens }` on 200 (linked steamId).
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
    const response = await fetch(new URL('/api/auth/steam/desktop-sign-in', params.serverUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Airi-Client': 'stage-tamagotchi',
      },
      body: JSON.stringify({ ticket: params.ticketHex }),
    })

    if (response.status === 403) {
      const text = await response.text().catch(() => '')
      let body: { errorCode?: unknown, enrollToken?: unknown, authUiUrl?: unknown } | null = null
      try {
        body = JSON.parse(text)
      }
      catch {
        body = null
      }
      if (
        body?.errorCode === STEAM_NEEDS_ENROLLMENT
        && typeof body.enrollToken === 'string'
        && typeof body.authUiUrl === 'string'
      ) {
        return {
          ok: false,
          kind: 'needs_enrollment',
          reason: 'Steam account is not linked — enrollment required',
          enrollToken: body.enrollToken,
          authUiUrl: body.authUiUrl,
        }
      }
      return { ok: false, kind: 'error', reason: `Steam sign-in failed (403): ${text}` }
    }

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, kind: 'error', reason: `Steam sign-in failed (${response.status}): ${text}` }
    }

    return {
      ok: true,
      tokens: await response.json() as TokenExchangeResult,
    }
  }
  catch (error) {
    return {
      ok: false,
      kind: 'error',
      reason: errorMessageFrom(error) ?? 'Steam sign-in request failed',
    }
  }
}
