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

export async function authenticateUserTicket(params: {
  publisherKey: string
  appId: string
  ticketHex: string
  identity: string
}): Promise<string> {
  const url = new URL('/ISteamUserAuth/AuthenticateUserTicket/v1/', STEAM_PARTNER_API)
  url.searchParams.set('key', params.publisherKey)
  url.searchParams.set('appid', params.appId)
  url.searchParams.set('ticket', params.ticketHex)
  url.searchParams.set('identity', params.identity)

  const body = await fetchSteamJson<AuthenticateUserTicketResponse>(url, 'Steam AuthenticateUserTicket')
  const result = body.response?.params?.result
  const steamId = body.response?.params?.steamid
  if (result !== 'OK' || !steamId)
    throw new Error(`Steam AuthenticateUserTicket: ${result ?? 'unknown'}`)

  return steamId
}

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
