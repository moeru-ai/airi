export function isPlatformTamagotchi() {
  return import.meta.env.MODE === 'tamagotchi'
}

export function isStandalone() {
  if (import.meta.env.SSR) {
    return false
  }
  if (!('window' in globalThis && globalThis.window != null)) {
    return false
  }

  const mediaStandalone = ('matchMedia' in window) && window.matchMedia('(display-mode: standalone)').matches
  const navigatorStandalone = ('navigator' in window && 'standalone' in window.navigator && window.navigator.standalone)
  const referrerStandalone = document.referrer.includes('android-app://')

  return mediaStandalone || navigatorStandalone || referrerStandalone
}
