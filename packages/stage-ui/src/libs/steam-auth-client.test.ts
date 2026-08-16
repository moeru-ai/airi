import { createAuthClient } from 'better-auth/client'
import { describe, expect, it, vi } from 'vitest'

import { steamClient } from './steam-auth-client'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('steamClient', () => {
  it('adds linkSteam, posting to /link/steam with the OAuth-style body', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      url: 'https://steamcommunity.com/openid/login?...',
      redirect: true,
    }))
    const client = createAuthClient({
      baseURL: 'https://api.airi.test',
      plugins: [steamClient()],
      fetchOptions: { customFetchImpl: fetchImpl },
    })

    const result = await client.linkSteam({
      callbackURL: '/profile',
      errorCallbackURL: '/profile?error=steam',
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.airi.test/api/auth/link/steam')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      callbackURL: '/profile',
      errorCallbackURL: '/profile?error=steam',
    })
    expect(result.data?.url).toBe('https://steamcommunity.com/openid/login?...')
  })

  it('adds signIn.steam, posting to /sign-in/steam without a provider field', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({
      url: 'https://steamcommunity.com/openid/login?...',
      redirect: true,
    }))
    const client = createAuthClient({
      baseURL: 'https://api.airi.test',
      plugins: [steamClient()],
      fetchOptions: { customFetchImpl: fetchImpl },
    })

    const result = await client.signIn.steam({ callbackURL: '/profile' })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.airi.test/api/auth/sign-in/steam')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ callbackURL: '/profile' })
    expect(result.data?.url).toBe('https://steamcommunity.com/openid/login?...')
  })
})
