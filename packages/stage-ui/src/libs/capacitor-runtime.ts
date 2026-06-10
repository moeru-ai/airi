export function getCapacitorPlatform(): string {
  if (typeof window === 'undefined')
    return 'web'

  // @ts-expect-error Capacitor is injected by the native runtime when available.
  return window.Capacitor?.getPlatform?.() ?? 'web'
}

export function isCapacitorNativePlatform(): boolean {
  if (typeof window === 'undefined')
    return false

  // @ts-expect-error Capacitor is injected by the native runtime when available.
  const capacitor = window.Capacitor
  if (!capacitor)
    return false

  if (typeof capacitor.isNativePlatform === 'function')
    return capacitor.isNativePlatform()

  const platform = capacitor.getPlatform?.()
  return !!platform && platform !== 'web'
}
