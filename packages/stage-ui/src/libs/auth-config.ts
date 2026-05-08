const FALLBACK = 'http://localhost'

const isAndroidNative = !!(
  // @ts-ignore
  window.Capacitor?.getPlatform?.() === 'android'
)
// @ts-ignore
const isNative = !!window.Capacitor || isAndroidNative

function getRedirectOrigin() {
  if (import.meta.env.VITE_OIDC_REDIRECT_URI)
    return import.meta.env.VITE_OIDC_REDIRECT_URI
  if (isAndroidNative)
    return 'ai.moeru.airi_pocket://links'
  return globalThis.location?.origin ?? FALLBACK
}

const origin = getRedirectOrigin()

export const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || (isNative ? 'airi-stage-pocket' : 'airi-stage-web')
export const OIDC_REDIRECT_URI = origin === 'ai.moeru.airi_pocket://links' ? origin : `${origin}/auth/callback`
