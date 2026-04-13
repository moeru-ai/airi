import { describe, expect, it, vi } from 'vitest'

import { createServerSignInContext, requestSocialSignInRedirect } from './sign-in'

describe('ui-server-auth sign-in flow helpers', () => {
  it('rebuilds the OIDC callback URL without provider and prompt query params', () => {
    expect(createServerSignInContext(
      'https://auth.airi.test/sign-in?client_id=airi-stage-web&provider=github&prompt=login&response_type=code&scope=openid',
      'https://api.airi.test',
    )).toEqual({
      callbackURL: 'https://api.airi.test/api/auth/oauth2/authorize?client_id=airi-stage-web&response_type=code&scope=openid',
      requestedProvider: 'github',
    })
  })

  it('falls back to the root path when no OIDC parameters are present', () => {
    expect(createServerSignInContext(
      'https://auth.airi.test/sign-in',
      'https://api.airi.test',
    )).toEqual({
      callbackURL: '/',
      requestedProvider: null,
    })
  })

  it('posts the selected provider and callback URL to the social sign-in endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ url: 'https://accounts.example.test/oauth/google' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    await expect(requestSocialSignInRedirect({
      apiServerUrl: 'https://api.airi.test',
      provider: 'google',
      callbackURL: 'https://api.airi.test/api/auth/oauth2/authorize?client_id=airi-stage-web',
      fetchImpl,
    })).resolves.toBe('https://accounts.example.test/oauth/google')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.airi.test/api/auth/sign-in/social',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        redirect: 'manual',
      }),
    )

    const init = fetchImpl.mock.calls[0]?.[1]

    expect(JSON.parse(String(init?.body))).toEqual({
      provider: 'google',
      callbackURL: 'https://api.airi.test/api/auth/oauth2/authorize?client_id=airi-stage-web',
    })
  })

  it('surfaces server-provided sign-in errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({
        error: {
          message: 'Provider is temporarily unavailable',
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    await expect(requestSocialSignInRedirect({
      apiServerUrl: 'https://api.airi.test',
      provider: 'github',
      callbackURL: '/',
      fetchImpl,
    })).rejects.toThrow('Provider is temporarily unavailable')
  })
})
