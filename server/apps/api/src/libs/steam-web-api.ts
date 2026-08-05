import { ofetch } from 'ofetch'

const STEAM_PARTNER_API = 'https://partner.steam-api.com'

interface AuthenticateUserTicketResponse {
  response?: {
    params?: {
      result?: string
      steamid?: string
    }
  }
}

/**
 * Verifies a Steam Web API auth ticket (`ISteamUser::GetAuthSessionTicket` /
 * `getAuthTicketForWebApi` on the client) and returns the SteamID it proves.
 *
 * Use when:
 * - The desktop app hands the server a session ticket and the server needs
 *   proof of Steam identity before trusting the claimed SteamID.
 */
export async function authenticateUserTicket(params: {
  publisherKey: string
  appId: string
  ticketHex: string
}): Promise<string> {
  const url = new URL('/ISteamUserAuth/AuthenticateUserTicket/v1/', STEAM_PARTNER_API)
  url.searchParams.set('key', params.publisherKey)
  url.searchParams.set('appid', params.appId)
  url.searchParams.set('ticket', params.ticketHex)
  url.searchParams.set('identity', 'airi-desktop')

  const body = await ofetch<AuthenticateUserTicketResponse>(url.toString())
  const result = body.response?.params?.result
  const steamId = body.response?.params?.steamid
  if (result !== 'OK' || !steamId)
    throw new Error(`Steam AuthenticateUserTicket: ${result ?? 'unknown'}`)

  return steamId
}
