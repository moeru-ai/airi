const FALLBACK = 'http://localhost'

/**
 * Safely retrieves environment status without crashing in non-browser runtimes.
 */
function getEnvStatus() {
  // If not in a browser environment, return default values immediately
  if (typeof window === 'undefined') {
    return { isAndroidNative: false, isNative: false }
  }

  // @ts-ignore
  const capacitor = window.Capacitor
  const isAndroidNative = !!(capacitor?.getPlatform?.() === 'android')
  const isNative = !!capacitor || isAndroidNative

  return { isAndroidNative, isNative }
}

/**
 * Resolves the redirect origin based on environment and configuration.
 */
function getRedirectOrigin() {
  // 1. Priority: Use environment variable if it exists
  if (import.meta.env.VITE_OIDC_REDIRECT_URI) {
    return import.meta.env.VITE_OIDC_REDIRECT_URI
  }

  const { isAndroidNative } = getEnvStatus()

  // 2. Handle Android Native (Capacitor) environment
  if (isAndroidNative) {
    return 'ai.moeru.airi-pocket://links'
  }

  // 3. Handle standard browser environment
  if (typeof window !== 'undefined') {
    return window.location?.origin ?? FALLBACK
  }

  // 4. Fallback for SSR/Node.js runtimes
  return FALLBACK
}

// --- Export Constants ---

const { isNative } = getEnvStatus()
const origin = getRedirectOrigin()

export const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID
  || (isNative ? 'airi-stage-pocket' : 'airi-stage-web')

export const OIDC_REDIRECT_URI = `${origin}/auth/callback`
