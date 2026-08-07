/**
 * OIDC redirect path for the Electron trusted client.
 *
 * The API server registers this exact path, so the desktop app must use the
 * same path in the authorize request and the token exchange.
 */
export const electronOidcRedirectPath = '/api/auth/oidc/electron-callback'
