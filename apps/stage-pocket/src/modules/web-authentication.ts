import { registerPlugin } from '@capacitor/core'

interface WebAuthenticationOptions {
  callbackScheme: string
  url: string
}

interface WebAuthenticationResult {
  callbackUrl?: string
}

interface WebAuthenticationPlugin {
  authenticate: (options: WebAuthenticationOptions) => Promise<WebAuthenticationResult>
}

/** Opens an authorization URL with the native system browser session. */
export const WebAuthentication = registerPlugin<WebAuthenticationPlugin>('WebAuthentication')
