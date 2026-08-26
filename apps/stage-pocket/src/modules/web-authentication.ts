import { registerPlugin } from '@capacitor/core'

interface WebAuthenticationOptions {
  callbackScheme: string
  url: string
}

interface WebAuthenticationPlugin {
  authenticate: (options: WebAuthenticationOptions) => Promise<WebAuthenticationResult>
}

interface WebAuthenticationResult {
  callbackUrl?: string
}

/** Opens an authorization URL with the native system browser session. */
export const WebAuthentication = registerPlugin<WebAuthenticationPlugin>('WebAuthentication')
