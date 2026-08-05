import { afterEach, describe, expect, it, vi } from 'vitest'

import { exchangeSteamTicketForTokens } from './steam-sign-in'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('exchangeSteamTicketForTokens', () => {
  it('exchanges ticket → authorization code → OIDC tokens on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'auth-code' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'a',
        expires_in: 3600,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await exchangeSteamTicketForTokens({
      serverUrl: 'https://api.airi.build',
      ticketHex: 'deadbeef',
    })

    expect(result).toEqual({ ok: true, tokens: { accessToken: 'a', expiresIn: 3600 } })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const signInInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const signInBody = JSON.parse(String(signInInit.body)) as Record<string, unknown>
    expect(signInBody.ticket).toBe('deadbeef')
    expect(signInBody.code_challenge_method).toBe('S256')
    expect(typeof signInBody.code_challenge).toBe('string')
    expect(String(signInBody.code_challenge)).toHaveLength(43)

    const tokenInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    const tokenBody = new URLSearchParams(String(tokenInit.body))
    expect(tokenBody.get('grant_type')).toBe('authorization_code')
    expect(tokenBody.get('code')).toBe('auth-code')
    expect(tokenBody.get('code_verifier')).toBeTruthy()
    expect(tokenBody.get('redirect_uri')).toBe('https://api.airi.build/api/auth/oidc/electron-callback')
  })

  it('returns an error result on a non-2xx response', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'STEAM_TICKET_INVALID' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
    const result = await exchangeSteamTicketForTokens({ serverUrl: 'https://api.airi.build', ticketHex: 'deadbeef' })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('403') })
  })

  it('returns an error result on a network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const result = await exchangeSteamTicketForTokens({ serverUrl: 'https://api.airi.build', ticketHex: 'deadbeef' })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('offline') })
  })
})
