import { describe, expect, it, vi } from 'vitest'

import { createServerSignInContext, requestSocialSignInRedirect } from './sign-in'

describe('ui-server-auth sign-in flow helpers', () => {
  it('rebuilds the OIDC callback URL without provider and prompt query params', () => {
    expect(createServerSignInContext(
      'https://auth.airi.test/sign-in?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app&client_id=airi-stage-web&provider=github&prompt=login&response_type=code&scope=openid',
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

  // ROOT CAUSE:
  //
  // Production hit `/api/auth/oauth2/authorize?token=4HEMlnagmOESfes99kW5nNmZ`
  // and got a VALIDATION_ERROR for missing client_id / response_type.
  //
  // The 24-char `token=...` is the format better-auth's password-reset
  // callback appends to redirectTo (password.mjs L65 generateId(24), L118
  // redirectCallback adds `?token=<token>`). When such a token-only URL
  // landed on /auth/sign-in (e.g. via a stale or misconfigured reset email),
  // the previous filter only stripped `provider`/`prompt` and treated any
  // remaining query as an OIDC handoff — synthesizing
  // /api/auth/oauth2/authorize?token=... and trapping the user on a 422.
  //
  // Fix: require both `client_id` and `response_type` before treating the
  // query as an OIDC continuation; otherwise fall back to '/'.
  it('ignores stray non-OIDC query params (Issue: production reset-password token leaking into authorize URL)', () => {
    expect(createServerSignInContext(
      'https://auth.airi.test/sign-in?token=4HEMlnagmOESfes99kW5nNmZ',
      'https://api.airi.test',
    )).toEqual({
      callbackURL: '/',
      requestedProvider: null,
    })
  })

  it('still falls back when the OIDC handoff is partial (client_id without response_type)', () => {
    expect(createServerSignInContext(
      'https://auth.airi.test/sign-in?client_id=airi-stage-web&scope=openid',
      'https://api.airi.test',
    )).toEqual({
      callbackURL: '/',
      requestedProvider: null,
    })
  })

  it('normalizes standalone UI redirects under the deployed /ui base', () => {
    expect(createServerSignInContext(
      'https://auth.airi.test/ui/sign-in?redirect=%2Fprofile%3Ftab%3Dsecurity',
      'https://api.airi.test',
    )).toEqual({
      callbackURL: 'https://auth.airi.test/ui/profile?tab=security',
      requestedProvider: null,
    })

    expect(createServerSignInContext(
      'https://auth.airi.test/ui/sign-in?redirect=%2Fauth%2Freset-password%3Ftoken%3Dold-link',
      'https://api.airi.test',
    )).toEqual({
      callbackURL: 'https://auth.airi.test/ui/reset-password?token=old-link',
      requestedProvider: null,
    })
  })

  it('keeps trusted standalone admin redirects on the admin origin', () => {
    expect(createServerSignInContext(
      'https://accounts.airi.build/ui/sign-in?redirect=https%3A%2F%2Fadmin.airi.build%2Fllm-router%3Fapi_server_url%3Dhttps%253A%252F%252Fairi-server-dev.up.railway.app',
      'https://api.airi.test',
    )).toEqual({
      callbackURL: 'https://admin.airi.build/llm-router?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app',
      requestedProvider: null,
    })

    expect(createServerSignInContext(
      'https://accounts.airi.build/ui/sign-in?redirect=http%3A%2F%2F127.0.0.1%3A5178%2Fllm-router%3Fapi_server_url%3Dhttp%253A%252F%252F127.0.0.1%253A3000',
      'https://api.airi.test',
    )).toEqual({
      callbackURL: 'http://127.0.0.1:5178/llm-router?api_server_url=http%3A%2F%2F127.0.0.1%3A3000',
      requestedProvider: null,
    })
  })

  it('rejects absolute redirects to untrusted origins', () => {
    expect(createServerSignInContext(
      'https://accounts.airi.build/ui/sign-in?redirect=https%3A%2F%2Fevil.example%2Fllm-router',
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
