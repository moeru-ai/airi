import { registerPlugin } from '@capacitor/core'

export const NATIVE_AUTH_CALLBACK_SCHEME = 'airi-pocket'
export const NATIVE_AUTH_REDIRECT_URI = `${NATIVE_AUTH_CALLBACK_SCHEME}://auth/callback`

export interface NativeAuthPlugin {
  authenticate: (options: {
    url: string
    callbackScheme: string
  }) => Promise<{ callbackUrl: string }>
}

const nativeAuth: NativeAuthPlugin = registerPlugin<NativeAuthPlugin>('AiriNativeAuth')

export async function openNativeAuthSession(url: string): Promise<string> {
  const result = await nativeAuth.authenticate({
    url,
    callbackScheme: NATIVE_AUTH_CALLBACK_SCHEME,
  })

  return result.callbackUrl
}
