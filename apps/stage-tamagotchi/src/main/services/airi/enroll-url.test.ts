import { describe, expect, it } from 'vitest'

import { buildEnrollUrl } from './enroll-url'

describe('buildEnrollUrl', () => {
  it('builds the enroll page URL with token + continue', () => {
    const url = buildEnrollUrl({
      authUiUrl: 'https://accounts.airi.build/ui',
      enrollToken: 'tok-123',
      continueUrl: 'https://api.airi.build/api/auth/oauth2/authorize?client_id=x',
    })
    expect(url).toBe('https://accounts.airi.build/ui/enroll?token=tok-123&continue=https%3A%2F%2Fapi.airi.build%2Fapi%2Fauth%2Foauth2%2Fauthorize%3Fclient_id%3Dx')
  })

  it('strips a trailing slash from the auth UI base', () => {
    const url = buildEnrollUrl({
      authUiUrl: 'https://accounts.airi.build/ui/',
      enrollToken: 'tok',
      continueUrl: 'https://api.airi.build/x',
    })
    expect(url.startsWith('https://accounts.airi.build/ui/enroll?')).toBe(true)
  })
})
