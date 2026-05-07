import { Capacitor } from '@capacitor/core'

const FALLBACK = 'http://localhost'
const isNative = Capacitor.isNativePlatform()
const platform = Capacitor.getPlatform()

function getRedirectOrigin() {
  if (import.meta.env.VITE_OIDC_REDIRECT_URI)
    return import.meta.env.VITE_OIDC_REDIRECT_URI
  if (isNative && platform === 'android')
    return 'ai.moeru.airi_pocket://links'
  return globalThis.location?.origin ?? FALLBACK
}

const origin = getRedirectOrigin()
export const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || (isNative ? 'airi-stage-pocket' : 'airi-stage-web')
export const OIDC_REDIRECT_URI = origin === 'ai.moeru.airi_pocket://links' ? origin : `${origin}/auth/callback`
