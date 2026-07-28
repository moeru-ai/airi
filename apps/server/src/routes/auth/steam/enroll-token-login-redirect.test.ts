import { describe, expect, it } from 'vitest'

import { attachEnrollTokenToTrustedLoginRedirect } from './enroll-token-login-redirect'

describe('attachEnrollTokenToTrustedLoginRedirect', () => {
  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3610763521
  it('re-attaches enrollToken on a relative /auth/sign-in redirect (PR #1966)', () => {
    const response = new Response(null, {
      status: 302,
      headers: {
        location: '/auth/sign-in?client_id=airi-stage-electron&response_type=code',
      },
    })

    const next = attachEnrollTokenToTrustedLoginRedirect(response, 'tok-enroll', {
      apiServerUrl: 'http://localhost:3000',
      authUiUrl: 'https://accounts.airi.build/ui',
    })

    expect(next.headers.get('location')).toBe(
      '/auth/sign-in?client_id=airi-stage-electron&response_type=code&enrollToken=tok-enroll',
    )
  })

  it('re-attaches enrollToken on the standalone auth UI sign-in redirect (PR #1966)', () => {
    const response = new Response(null, {
      status: 302,
      headers: {
        location: 'https://accounts.airi.build/ui/sign-in?client_id=airi-stage-electron&response_type=code',
      },
    })

    const next = attachEnrollTokenToTrustedLoginRedirect(response, 'tok-enroll', {
      apiServerUrl: 'http://localhost:3000',
      authUiUrl: 'https://accounts.airi.build/ui',
    })

    expect(next.headers.get('location')).toBe(
      'https://accounts.airi.build/ui/sign-in?client_id=airi-stage-electron&response_type=code&enrollToken=tok-enroll',
    )
  })

  it('does not attach enrollToken to non-login redirects (PR #1966)', () => {
    const response = new Response(null, {
      status: 302,
      headers: {
        location: '/api/auth/oidc/electron-callback?code=ac_1&state=43123:opaque',
      },
    })

    const next = attachEnrollTokenToTrustedLoginRedirect(response, 'tok-enroll', {
      apiServerUrl: 'http://localhost:3000',
      authUiUrl: 'https://accounts.airi.build/ui',
    })

    expect(next.headers.get('location')).toBe(
      '/api/auth/oidc/electron-callback?code=ac_1&state=43123:opaque',
    )
  })

  it('does not attach enrollToken to untrusted login hosts (PR #1966)', () => {
    const response = new Response(null, {
      status: 302,
      headers: {
        location: 'https://attacker.example/ui/sign-in?client_id=x',
      },
    })

    const next = attachEnrollTokenToTrustedLoginRedirect(response, 'tok-enroll', {
      apiServerUrl: 'http://localhost:3000',
      authUiUrl: 'https://accounts.airi.build/ui',
    })

    expect(next.headers.get('location')).toBe('https://attacker.example/ui/sign-in?client_id=x')
  })
})
