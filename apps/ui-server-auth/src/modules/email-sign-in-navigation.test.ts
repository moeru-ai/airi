import { describe, expect, it } from 'vitest'

import { emailSignInNavigationURL } from './email-sign-in-navigation'

describe('emailSignInNavigationURL', () => {
  const authorize = 'https://airi-server-dev.up.railway.app/api/auth/oauth2/authorize?client_id=airi-stage-pocket&response_type=code'

  it('keeps a same-site sign-in on the authorize URL', () => {
    expect(emailSignInNavigationURL({
      pageOrigin: 'https://accounts.airi.build',
      apiServerUrl: 'https://accounts.airi.build',
      token: 'session-token',
      redirectURL: 'https://accounts.airi.build/api/auth/oauth2/authorize?response_type=code&client_id=airi',
      callbackURL: authorize,
    })).toBe('https://accounts.airi.build/api/auth/oauth2/authorize?response_type=code&client_id=airi')
  })

  it('sends a cross-site sign-in through the API handoff so the cookie is first-party', () => {
    const url = new URL(emailSignInNavigationURL({
      pageOrigin: 'https://server-dev.airi-server-auth.pages.dev',
      apiServerUrl: 'https://airi-server-dev.up.railway.app',
      token: 'session-token',
      redirectURL: authorize,
      callbackURL: authorize,
    }))
    expect(url.origin).toBe('https://airi-server-dev.up.railway.app')
    expect(url.pathname).toBe('/api/auth/session-handoff')
    expect(url.searchParams.get('token')).toBe('session-token')
    expect(url.searchParams.get('next')).toBe(authorize)
  })
})
