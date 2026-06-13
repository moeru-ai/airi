import type { TokenExchangeResult } from './auth'

export async function exchangeSteamTicketForTokens(params: {
  serverUrl: string
  ticketHex: string
}): Promise<TokenExchangeResult> {
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
    throw new Error(`Steam sign-in failed (${response.status}): ${text}`)
  }

  return await response.json() as TokenExchangeResult
}
