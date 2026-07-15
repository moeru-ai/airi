import { beforeEach, describe, expect, it, vi } from 'vitest'

function stubWindow(capacitor?: { getPlatform: () => string, isNativePlatform?: () => boolean }) {
  vi.stubGlobal('window', {
    location: {
      origin: 'https://airi.moeru.ai',
    },
    Capacitor: capacitor,
  })
}

describe('oIDC client config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    stubWindow()
  })

  it('uses the web redirect URI in browsers', async () => {
    const { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } = await import('./auth-config')

    expect(OIDC_CLIENT_ID).toBe('airi-stage-web')
    expect(OIDC_REDIRECT_URI).toBe('https://airi.moeru.ai/auth/callback')
  })

  it('uses VITE_OIDC_REDIRECT_URI as the full redirect URI when set', async () => {
    vi.stubEnv('VITE_OIDC_REDIRECT_URI', 'https://example.com/auth/callback')

    const { OIDC_REDIRECT_URI } = await import('./auth-config')

    expect(OIDC_REDIRECT_URI).toBe('https://example.com/auth/callback')
  })

  it('uses the app-owned Pocket redirect URI on native platforms', async () => {
    stubWindow({
      getPlatform: () => 'ios',
      isNativePlatform: () => true,
    })

    const { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } = await import('./auth-config')

    expect(OIDC_CLIENT_ID).toBe('airi-stage-pocket')
    expect(OIDC_REDIRECT_URI).toBe('airi-pocket://auth/callback')
  })

  it('keeps the existing Capacitor callback for Android until an Android launcher exists', async () => {
    stubWindow({
      getPlatform: () => 'android',
      isNativePlatform: () => true,
    })

    const { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } = await import('./auth-config')

    expect(OIDC_CLIENT_ID).toBe('airi-stage-pocket')
    expect(OIDC_REDIRECT_URI).toBe('capacitor://localhost/auth/callback')
  })
})
