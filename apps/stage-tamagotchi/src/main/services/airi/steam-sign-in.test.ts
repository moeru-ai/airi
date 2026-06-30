import { afterEach, describe, expect, it, vi } from 'vitest'

import { exchangeSteamTicketForTokens } from './steam-sign-in'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function mockFetch(response: Response) {
  globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch
}

describe('exchangeSteamTicketForTokens', () => {
  it('returns tokens on 200', async () => {
    mockFetch(new Response(JSON.stringify({ accessToken: 'a', expiresIn: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const result = await exchangeSteamTicketForTokens({ serverUrl: 'https://api.airi.build', ticketHex: 'deadbeef' })
    expect(result).toEqual({ ok: true, tokens: { accessToken: 'a', expiresIn: 3600 } })
  })

  it('returns needs_enrollment on a 403 STEAM_NEEDS_ENROLLMENT body', async () => {
    mockFetch(new Response(JSON.stringify({ errorCode: 'STEAM_NEEDS_ENROLLMENT', enrollToken: 'tok-1', authUiUrl: 'https://accounts.airi.build/ui' }), { status: 403, headers: { 'content-type': 'application/json' } }))
    const result = await exchangeSteamTicketForTokens({ serverUrl: 'https://api.airi.build', ticketHex: 'deadbeef' })
    expect(result.ok).toBe(false)
    if (!result.ok && result.kind === 'needs_enrollment') {
      expect(result.enrollToken).toBe('tok-1')
      expect(result.authUiUrl).toBe('https://accounts.airi.build/ui')
    }
    else {
      throw new Error('expected needs_enrollment result')
    }
  })

  it('returns a generic error on a 403 without the enrollment code', async () => {
    mockFetch(new Response(JSON.stringify({ error: 'STEAM_NO_OWNERSHIP' }), { status: 403, headers: { 'content-type': 'application/json' } }))
    const result = await exchangeSteamTicketForTokens({ serverUrl: 'https://api.airi.build', ticketHex: 'deadbeef' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.kind).toBe('error')
  })

  it('returns a generic error on a network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const result = await exchangeSteamTicketForTokens({ serverUrl: 'https://api.airi.build', ticketHex: 'deadbeef' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.kind).toBe('error')
  })
})
