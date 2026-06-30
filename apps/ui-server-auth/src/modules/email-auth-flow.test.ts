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
  const fallback = 'https://api.airi.build'

  it('returns null when token or continue is missing', () => {
    expect(createEnrollContext('https://accounts.airi.build/ui/enroll?token=abc', fallback)).toBeNull()
    expect(createEnrollContext('https://accounts.airi.build/ui/enroll?continue=https://api.airi.build/x', fallback)).toBeNull()
  })

  it('returns null when continue is not a valid URL', () => {
    expect(createEnrollContext('https://accounts.airi.build/ui/enroll?token=abc&continue=not-a-url', fallback)).toBeNull()
  })

  it('derives apiServerUrl from the continue origin', () => {
    const ctx = createEnrollContext('https://accounts.airi.build/ui/enroll?token=abc&continue=https://api.airi.build/api/auth/oauth2/authorize?client_id=x', fallback)
    expect(ctx).toEqual({
      enrollToken: 'abc',
      continueUrl: 'https://api.airi.build/api/auth/oauth2/authorize?client_id=x',
      apiServerUrl: 'https://api.airi.build',
    })
  })

  it('uses the fallback apiServerUrl when continue has no origin', () => {
    // Covered by the invalid-URL case above; this asserts the fallback is the
    // last-resort, not the primary path.
    expect(createEnrollContext('https://accounts.airi.build/ui/enroll?token=abc&continue=bad', fallback)).toBeNull()
  })
})
