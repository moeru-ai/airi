import { beforeEach, describe, expect, it, vi } from 'vitest'

let nativeAuthenticate: ReturnType<typeof vi.fn>

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    authenticate: nativeAuthenticate,
  }),
}))

describe('openNativeAuthSession', () => {
  beforeEach(() => {
    nativeAuthenticate = vi.fn().mockResolvedValue({
      callbackUrl: 'airi-pocket://auth/callback?code=auth-code&state=state',
    })
    vi.resetModules()
  })

  it('opens an ASWebAuthenticationSession with the Pocket callback scheme', async () => {
    const { NATIVE_AUTH_CALLBACK_SCHEME, openNativeAuthSession } = await import('./native-auth')

    const callbackUrl = await openNativeAuthSession('https://api.airi.build/api/auth/oauth2/authorize')

    expect(NATIVE_AUTH_CALLBACK_SCHEME).toBe('airi-pocket')
    expect(callbackUrl).toBe('airi-pocket://auth/callback?code=auth-code&state=state')
    expect(nativeAuthenticate).toHaveBeenCalledWith({
      url: 'https://api.airi.build/api/auth/oauth2/authorize',
      callbackScheme: 'airi-pocket',
    })
  })
})
