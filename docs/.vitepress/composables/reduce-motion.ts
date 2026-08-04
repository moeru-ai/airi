export const REDUCE_MOTION_STORAGE_KEY = 'docs:settings/reduce-motion'

/**
 * Defaults "Reduce motion" to enabled on first visit when the device is a
 * touch device (mobile). Must be called before site components read this
 * localStorage key (during client app initialization). Once the user has
 * toggled the switch, the stored value is respected and never overridden.
 */
export function applyReduceMotionDefaults(): void {
  if (typeof window === 'undefined')
    return
  if (window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) !== null)
    return
  if (window.matchMedia('(pointer: coarse)').matches)
    window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, 'true')
}
