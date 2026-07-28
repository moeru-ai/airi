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

  it('returns needs_enrollment on a 403 STEAM_NEEDS_ENROLLMENT body', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      errorCode: 'STEAM_NEEDS_ENROLLMENT',
      enrollToken: 'tok-1',
      authUiUrl: 'https://accounts.airi.build/ui',
    }), { status: 403, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch

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
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'STEAM_NO_OWNERSHIP' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
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
