import { describe, expect, it } from 'vitest'

import { getAuthTrustedOrigins, getTrustedOrigin, resolveTrustedRequestOrigin } from '../origin'

describe('origin utils', () => {
  it('allows localhost origins', () => {
    expect(getTrustedOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('rejects untrusted origins', () => {
    expect(getTrustedOrigin('https://example.com')).toBe('')
  })

  it('prefers a trusted referer origin', () => {
    const request = new Request('http://localhost/api/v1/stripe/checkout', {
      headers: {
        referer: 'https://airi.moeru.ai/settings/flux',
        origin: 'https://example.com',
      },
    })

    expect(resolveTrustedRequestOrigin(request)).toBe('https://airi.moeru.ai')
  })

  it('falls back to a trusted origin header when referer is missing', () => {
    const request = new Request('http://localhost/api/v1/stripe/checkout', {
      headers: {
        origin: 'http://localhost:5173',
      },
    })

    expect(resolveTrustedRequestOrigin(request)).toBe('http://localhost:5173')
  })

  it('collects api and request origins for auth', () => {
    const request = new Request('http://localhost/api/auth/sign-in/social', {
      headers: {
        origin: 'http://localhost:5173',
      },
    })

    expect(getAuthTrustedOrigins({ API_SERVER_URL: 'https://api.airi.moeru.ai' } as any, request)).toEqual([
      'https://api.airi.moeru.ai',
      'http://localhost:5173',
    ])
  })
})
