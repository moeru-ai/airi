import { beforeEach, describe, expect, it, vi } from 'vitest'

let nativePlatform = false
let platform = 'web'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => platform,
    isNativePlatform: () => nativePlatform,
  },
  registerPlugin: () => ({
    authenticate: vi.fn(),
  }),
}))

describe('oIDC client config', () => {
  beforeEach(() => {
    nativePlatform = false
    platform = 'web'
    vi.resetModules()
    vi.stubGlobal('window', {
      location: {
        origin: 'https://airi.moeru.ai',
      },
    })
  })

  it('uses the web redirect URI in browsers', async () => {
    const { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } = await import('./auth-config')

    expect(OIDC_CLIENT_ID).toBe('airi-stage-web')
    expect(OIDC_REDIRECT_URI).toBe('https://airi.moeru.ai/auth/callback')
  })

  it('uses the app-owned Pocket redirect URI on native platforms', async () => {
    nativePlatform = true
    platform = 'ios'

    const { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } = await import('./auth-config')

    expect(OIDC_CLIENT_ID).toBe('airi-stage-pocket')
    expect(OIDC_REDIRECT_URI).toBe('airi-pocket://auth/callback')
  })

  it('keeps the existing Capacitor callback for Android until an Android launcher exists', async () => {
    nativePlatform = true
    platform = 'android'

    const { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } = await import('./auth-config')

    expect(OIDC_CLIENT_ID).toBe('airi-stage-pocket')
    expect(OIDC_REDIRECT_URI).toBe('capacitor://localhost/auth/callback')
  })
})
