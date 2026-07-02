import { describe, expect, it } from 'vitest'

import { createEnrollContext, decideEmailStep } from './email-auth-flow'

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
