import { errorMessageFrom } from '@moeru/std'

const STEAM_PARTNER_API = 'https://partner.steam-api.com'

interface AuthenticateUserTicketResponse {
  response?: {
    params?: {
      result?: string
      steamid?: string
    }
  }
}

interface CheckAppOwnershipResponse {
  appownership?: {
    ownsapp?: boolean
  }
}

interface GetPlayerSummariesResponse {
  response?: {
    players?: Array<{
      personaname?: string
      avatarfull?: string
    }>
  }
}

async function fetchSteamJson<T>(url: URL, label: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  }
  catch (error) {
    throw new Error(`${label} failed: ${errorMessageFrom(error) ?? 'unknown'}`)
  }

  if (!res.ok)
    throw new Error(`${label} HTTP ${res.status}`)

  return await res.json() as T
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

  const body = await fetchSteamJson<AuthenticateUserTicketResponse>(url, 'Steam AuthenticateUserTicket')
  const result = body.response?.params?.result
  const steamId = body.response?.params?.steamid
  if (result !== 'OK' || !steamId)
    throw new Error(`Steam AuthenticateUserTicket: ${result ?? 'unknown'}`)

  return steamId
}

/**
 * Checks whether a SteamID owns the given app.
 *
 * Use when:
 * - A verified SteamID (from {@link authenticateUserTicket}) needs an
 *   anti-fraud check that only the ticket-based desktop path can perform —
 *   the browser OpenID sign-in has no ticket to check ownership against.
 */
export async function checkAppOwnership(params: {
  publisherKey: string
  steamId: string
  appId: string
}): Promise<boolean> {
  const url = new URL('/ISteamUser/CheckAppOwnership/v4/', STEAM_PARTNER_API)
  url.searchParams.set('key', params.publisherKey)
  url.searchParams.set('steamid', params.steamId)
  url.searchParams.set('appid', params.appId)

  const body = await fetchSteamJson<CheckAppOwnershipResponse>(url, 'Steam CheckAppOwnership')
  return body.appownership?.ownsapp === true
}

/**
 * Fetches a SteamID's public display name and avatar.
 *
 * Returns `null` on any failure (missing player, HTTP error) rather than
 * throwing, since profile data is cosmetic and must never block sign-in.
 */
export async function getPlayerSummaries(params: {
  publisherKey: string
  steamId: string
}): Promise<{ name: string, image: string } | null> {
  const url = new URL('/ISteamUser/GetPlayerSummaries/v2/', STEAM_PARTNER_API)
  url.searchParams.set('key', params.publisherKey)
  url.searchParams.set('steamids', params.steamId)

  try {
    const body = await fetchSteamJson<GetPlayerSummariesResponse>(url, 'Steam GetPlayerSummaries')
    const player = body.response?.players?.[0]
    if (!player)
      return null

    return {
      name: player.personaname?.trim() ?? '',
      image: player.avatarfull?.trim() ?? '',
    }
  }
  catch {
    return null
  }
}
