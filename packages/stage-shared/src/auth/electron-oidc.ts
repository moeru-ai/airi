/**
 * Electron trusted-client `redirect_uri` used for code binding in the loopback
 * and Steam silent sign-in flows.
 *
 * The API server registers this exact path, so the desktop app must send the
 * same URI in the authorize request and the token exchange.
 */
export const electronOidcRedirectPath = '/api/auth/oidc/electron-callback'
