export type SteamInitResult
  = | { ok: true }
    | { ok: false, reason: 'not_steam' | 'init_failed' | 'api_unavailable' }

export type SteamTicketResult
  = | { ok: true, ticketHex: string }
    | { ok: false, reason: string }
