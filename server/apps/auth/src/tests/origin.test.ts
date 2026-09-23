import { describe, expect, it } from 'vitest'

import { getAuthTrustedOrigins, getTrustedOrigin } from '../origin'

describe('auth origin policy', () => {
  it('collects public, first-party, loopback, and request origins', () => {
    const request = new Request('http://localhost/api/auth/sign-in/social', {
      headers: { origin: 'http://localhost:5173' },
    })

    expect(getAuthTrustedOrigins({
      PUBLIC_URL: 'https://api.airi.moeru.ai',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    }, request)).toEqual([
      'https://api.airi.moeru.ai',
      'https://airi.moeru.ai',
      'https://accounts.airi.build',
      'https://server-dev.airi-server-auth.pages.dev',
      'https://admin.airi.build',
      'https://server-dev.airi-server-admin.pages.dev',
      'https://appleid.apple.com',
      'http://localhost:*',
      'http://127.0.0.1:*',
      'http://localhost:5173',
    ])
  })

  it('includes explicit development origins without trusting native callback schemes', () => {
    const origins = getAuthTrustedOrigins({
      PUBLIC_URL: 'https://api.airi.build',
      ADDITIONAL_TRUSTED_ORIGINS: ['https://10.0.0.129:5273'],
    })

    expect(origins).toContain('https://10.0.0.129:5273')
    expect(getTrustedOrigin('capacitor://localhost')).toBe('capacitor://localhost')
    expect(origins).not.toContain('capacitor://localhost')
    expect(origins).not.toContain('ai.moeru.airi-pocket://links')
  })

  it('always trusts the first-party auth UI for email callbacks', () => {
    expect(getAuthTrustedOrigins({
      PUBLIC_URL: 'https://api.airi.build',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    })).toContain('https://accounts.airi.build')
  })
})
