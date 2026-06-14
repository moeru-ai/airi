import { describe, expect, it } from 'vitest'

import { getAuthTrustedOrigins, getTrustedOrigin, resolveCheckoutRedirectBase, resolveTrustedRequestOrigin } from '../origin'

describe('origin utils', () => {
  it('allows localhost origins', () => {
    expect(getTrustedOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('allows https localhost (mkcert dev)', () => {
    expect(getTrustedOrigin('https://localhost:5273')).toBe('https://localhost:5273')
    expect(getTrustedOrigin('https://127.0.0.1:5273')).toBe('https://127.0.0.1:5273')
  })

  it('allows the standalone auth and admin UI origins', () => {
    expect(getTrustedOrigin('https://accounts.airi.build')).toBe('https://accounts.airi.build')
    expect(getTrustedOrigin('https://server-dev.airi-server-auth.pages.dev')).toBe('https://server-dev.airi-server-auth.pages.dev')
    expect(getTrustedOrigin('https://admin.airi.build')).toBe('https://admin.airi.build')
    expect(getTrustedOrigin('https://server-dev.airi-server-admin.pages.dev')).toBe('https://server-dev.airi-server-admin.pages.dev')
  })

  it('rejects private LAN Vite dev origins unless listed in ADDITIONAL_TRUSTED_ORIGINS', () => {
    expect(getTrustedOrigin('https://10.0.0.129:5273')).toBe('')
    expect(getTrustedOrigin('https://198.18.0.1:5273')).toBe('')
    expect(getTrustedOrigin('https://192.168.1.5:5273')).toBe('')

    const extra = ['https://10.0.0.129:5273', 'https://198.18.0.1:5273', 'https://192.168.1.5:5273']
    expect(getTrustedOrigin('https://10.0.0.129:5273', extra)).toBe('https://10.0.0.129:5273')
    expect(getTrustedOrigin('https://198.18.0.1:5273', extra)).toBe('https://198.18.0.1:5273')
    expect(getTrustedOrigin('https://192.168.1.5:5273', extra)).toBe('https://192.168.1.5:5273')
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

    expect(getAuthTrustedOrigins({
      API_SERVER_URL: 'https://api.airi.moeru.ai',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    }, request)).toEqual([
      'https://api.airi.moeru.ai',
      'https://airi.moeru.ai',
      'https://accounts.airi.build',
      'https://server-dev.airi-server-auth.pages.dev',
      'https://admin.airi.build',
      'https://server-dev.airi-server-admin.pages.dev',
      'http://localhost:*',
      'http://127.0.0.1:*',
      'http://localhost:5173',
    ])
  })

  describe('resolveCheckoutRedirectBase', () => {
    const fallback = 'https://airi.moeru.ai'

    it('prefers the trusted request origin over the fallback', () => {
      const request = new Request('http://localhost/api/v1/stripe/checkout', {
        headers: { referer: 'http://localhost:5173/settings/flux' },
      })

      expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe('http://localhost:5173')
    })

    // ROOT CAUSE:
    //
    // The packaged Electron renderer loads from file://, so its Stripe checkout
    // request carries no Referer and an opaque/absent Origin. resolveTrustedRequestOrigin
    // then returns undefined and the checkout route threw
    // `createBadRequestError('Missing trusted request origin', 'INVALID_ORIGIN')`,
    // blocking FLUX purchases on desktop (web/mobile were unaffected because they
    // send a trusted web origin).
    //
    // Before patch: no trusted origin -> undefined -> route throws INVALID_ORIGIN.
    // After patch: no trusted origin -> falls back to the configured web app URL,
    // which Stripe accepts as a success_url/cancel_url base.
    it('falls back to the web app URL when the request has no trusted origin (Electron file://)', () => {
      const request = new Request('http://localhost/api/v1/stripe/checkout', {
        method: 'POST',
        // file:// renderers send no Referer; Origin is absent or the opaque literal "null".
        headers: { origin: 'null' },
      })

      expect(resolveTrustedRequestOrigin(request, [])).toBeUndefined()
      expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe(fallback)
    })

    it('falls back to the web app URL for an untrusted web origin', () => {
      const request = new Request('http://localhost/api/v1/stripe/checkout', {
        headers: { origin: 'https://evil.example.com' },
      })

      expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe(fallback)
    })
  })

  it('includes ADDITIONAL_TRUSTED_ORIGINS in Better Auth trustedOrigins list', () => {
    expect(getAuthTrustedOrigins({
      API_SERVER_URL: 'https://api.airi.moeru.ai',
      ADDITIONAL_TRUSTED_ORIGINS: ['https://10.0.0.129:5273'],
    })).toEqual([
      'https://api.airi.moeru.ai',
      'https://airi.moeru.ai',
      'https://accounts.airi.build',
      'https://server-dev.airi-server-auth.pages.dev',
      'https://admin.airi.build',
      'https://server-dev.airi-server-admin.pages.dev',
      'https://10.0.0.129:5273',
      'http://localhost:*',
      'http://127.0.0.1:*',
    ])
  })

  it('does not include native deep-link schemes in Better Auth trustedOrigins', () => {
    expect(getTrustedOrigin('capacitor://localhost')).toBe('capacitor://localhost')
    expect(getTrustedOrigin('ai.moeru.airi-pocket://links')).toBe('ai.moeru.airi-pocket://links')

    const authOrigins = getAuthTrustedOrigins({
      API_SERVER_URL: 'https://api.airi.build',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    })

    expect(authOrigins).not.toContain('capacitor://localhost')
    expect(authOrigins).not.toContain('ai.moeru.airi-pocket://links')
  })

  // ROOT CAUSE:
  //
  // Email verification links carry a callbackURL query parameter that Better
  // Auth validates only against its trustedOrigins list. The standalone auth
  // UI sends callbackURL=https://accounts.airi.build/ui/verify-email?verified=true,
  // but getAuthTrustedOrigins previously listed only API_SERVER_URL,
  // additional env origins, and localhost wildcards. Clicking the email from
  // a normal inbox has no usable Origin/Referer header, so request-derived
  // trust could not add the auth UI origin and Better Auth returned
  // INVALID_CALLBACK_URL.
  //
  // Before patch: auth UI callback -> not in trustedOrigins -> 403.
  // After patch: built-in first-party exact origins are always present.
  it('includes built-in first-party origins for email verification callbacks without request headers', () => {
    expect(getAuthTrustedOrigins({
      API_SERVER_URL: 'https://api.airi.build',
      ADDITIONAL_TRUSTED_ORIGINS: [],
    })).toContain('https://accounts.airi.build')
  })
})
