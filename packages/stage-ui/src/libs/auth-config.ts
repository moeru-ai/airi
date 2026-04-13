// Centralized OIDC client configuration for the web platform.
// Electron and Pocket have their own configs due to different client IDs and redirect strategies.

export const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-web'
export const OIDC_REDIRECT_URI = `${window.location.origin}/auth/callback`
