import type { TokenExchangeResult } from './auth'

import { errorMessageFrom } from '@moeru/std'

export async function exchangeSteamTicketForTokens(params: {
  serverUrl: string
  ticketHex: string
}): Promise<
  | { ok: true, tokens: TokenExchangeResult }
  | { ok: false, reason: string }
> {
  try {
    const response = await fetch(new URL('/api/auth/steam/desktop-sign-in', params.serverUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Airi-Client': 'stage-tamagotchi',
      },
      body: JSON.stringify({ ticket: params.ticketHex }),
    })

    if (!response.ok) {
      const text = await response.text()
      return {
        ok: false,
        reason: `Steam sign-in failed (${response.status}): ${text}`,
      }
    }

    return {
      ok: true,
      tokens: await response.json() as TokenExchangeResult,
    }
  }
  catch (error) {
    return {
      ok: false,
      reason: errorMessageFrom(error) ?? 'Steam sign-in request failed',
    }
  }
}
