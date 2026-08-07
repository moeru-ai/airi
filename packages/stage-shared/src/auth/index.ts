export { electronOidcRedirectPath } from './electron-oidc'
export { base64UrlEncode, generateCodeChallenge, generateCodeVerifier, generateState } from './pkce'

/** OIDC client id shared by the main-process token exchange and the renderer bridge. */
export const oidcClientId = import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-electron'
