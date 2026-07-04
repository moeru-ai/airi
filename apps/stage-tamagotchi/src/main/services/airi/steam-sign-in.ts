import type { TokenExchangeResult } from './auth'

import { errorMessageFrom } from '@moeru/std'
import { literal, object, safeParse, string } from 'valibot'

const STEAM_NEEDS_ENROLLMENT = 'STEAM_NEEDS_ENROLLMENT'

// Mirrors the 403 body from apps/server/src/routes/auth/steam/desktop-sign-in.ts.
const SteamNeedsEnrollmentBodySchema = object({
  errorCode: literal(STEAM_NEEDS_ENROLLMENT),
  enrollToken: string(),
  authUiUrl: string(),
})

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
