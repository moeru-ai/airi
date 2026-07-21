import { describe, expect, it } from 'vitest'

import { buildVerifyEmailCallbackUrl, createEnrollContext, decideEmailStep } from './email-auth-flow'

describe('decideEmailStep', () => {
  it('routes a new email to the create step', () => {
    expect(decideEmailStep({ exists: false, hasPassword: false })).toBe('create')
  })

  it('routes an existing credential user to the password step', () => {
    expect(decideEmailStep({ exists: true, hasPassword: true })).toBe('password')
  })

  it('routes an existing social-only user to social-only', () => {
    expect(decideEmailStep({ exists: true, hasPassword: false })).toBe('social-only')
  })
})

describe('createEnrollContext', () => {
  it('returns null when token or continue is missing', () => {
    expect(createEnrollContext('https://accounts.airi.build/ui/enroll?token=abc')).toBeNull()
    expect(createEnrollContext('https://accounts.airi.build/ui/enroll?continue=https://api.airi.build/x')).toBeNull()
  })

  it('returns null when continue is not a valid URL', () => {
    expect(createEnrollContext('https://accounts.airi.build/ui/enroll?token=abc&continue=not-a-url')).toBeNull()
  })

  it('derives apiServerUrl from the continue origin', () => {
    const ctx = createEnrollContext('https://accounts.airi.build/ui/enroll?token=abc&continue=https://api.airi.build/api/auth/oauth2/authorize?client_id=x')
    expect(ctx).toEqual({
      enrollToken: 'abc',
      continueUrl: 'https://api.airi.build/api/auth/oauth2/authorize?client_id=x',
      apiServerUrl: 'https://api.airi.build',
    })
  })
})

describe('buildVerifyEmailCallbackUrl', () => {
  it('embeds api_server_url and continueURL for the email-link success tab', () => {
    const url = buildVerifyEmailCallbackUrl({
      verifyEmailPath: 'https://server-dev.airi-server-auth.pages.dev/ui/verify-email',
      apiServerUrl: 'https://airi-server-dev.up.railway.app',
      apiServerUrlQueryParam: 'api_server_url',
      continueURL: 'https://airi-server-dev.up.railway.app/api/auth/oauth2/authorize?enrollToken=tok',
    })

    const parsed = new URL(url)
    expect(parsed.searchParams.get('verified')).toBe('true')
    expect(parsed.searchParams.get('api_server_url')).toBe('https://airi-server-dev.up.railway.app')
    expect(parsed.searchParams.get('continueURL')).toBe(
      'https://airi-server-dev.up.railway.app/api/auth/oauth2/authorize?enrollToken=tok',
    )
  })

  it('omits continueURL when enrollment resume is not needed', () => {
    const url = buildVerifyEmailCallbackUrl({
      verifyEmailPath: 'https://accounts.airi.build/ui/verify-email',
      apiServerUrl: 'https://api.airi.build',
      apiServerUrlQueryParam: 'api_server_url',
    })

    expect(new URL(url).searchParams.get('continueURL')).toBeNull()
  })
})
