import type { Ref } from 'vue'

import { useTimeoutFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

export interface UseControlsIslandAutoHideOptions {
  /** Whether auto-hide is enabled */
  autoHideControlsIsland: Ref<boolean>
  /** Delay in seconds before hiding when mouse leaves */
  autoHideDelay: Ref<number>
  /** Delay in seconds before showing when mouse enters */
  autoShowDelay: Ref<number>
  /** Opacity value (0-100) when hidden */
  autoHideOpacity: Ref<number>
  /** Whether mouse is outside the element */
  isOutside: Ref<boolean>
  /** Whether there's a blocking overlay */
  isBlocked: Ref<boolean>
  /** Whether the panel is expanded */
  expanded: Ref<boolean>
}

export interface UseControlsIslandAutoHideReturn {
  /** Delayed state: true after mouse has been outside for configured delay */
  isOutsideDelayed: Ref<boolean>
  /** Delayed state: true after mouse has been inside for configured delay */
  isInsideDelayed: Ref<boolean>
  /** Whether the island is currently hidden */
  isHidden: Ref<boolean>
  /** Opacity value (0-1) when hidden */
  hiddenOpacity: Ref<number>
  /** Stop all timers (useful when component unmounts) */
  stopAll: () => void
}

/**
 * Composable for controls island auto-hide/show behavior.
 *
 * Uses timeout-based delays (not debounce) because:
 * - We want a single delayed action when mouse enters/leaves
 * - Intermediate movements should reset the countdown, not extend it
 * - useTimeoutFn allows stopping/restarting the timer cleanly
 *
 * Flow:
 * 1. Mouse enter → start show timer → after autoShowDelay, isInsideDelayed=true → isHidden=false
 * 2. Mouse leave → start hide timer → after autoHideDelay, isOutsideDelayed=true → isHidden=true
 * 3. If mouse re-enters before timer fires, timer is stopped and reset
 */
export function useControlsIslandAutoHide(options: UseControlsIslandAutoHideOptions): UseControlsIslandAutoHideReturn {
  const { autoHideControlsIsland, autoHideDelay, autoShowDelay, autoHideOpacity, isOutside, isBlocked, expanded } = options

  const isOutsideDelayed = ref(isOutside.value)
  const isInsideDelayed = ref(!isOutside.value)

  const hideDelayMs = computed(() => autoHideDelay.value * 1000)
  const showDelayMs = computed(() => autoShowDelay.value * 1000)

  const { start: startHideTimer, stop: stopHideTimer } = useTimeoutFn(() => {
    isOutsideDelayed.value = true
  }, hideDelayMs, { immediate: false })

  const { start: startShowTimer, stop: stopShowTimer } = useTimeoutFn(() => {
    isInsideDelayed.value = true
  }, showDelayMs, { immediate: false })

  const stopAll = () => {
    stopHideTimer()
    stopShowTimer()
  }

  const syncDelayedStates = () => {
    isOutsideDelayed.value = isOutside.value
    isInsideDelayed.value = !isOutside.value
  }

  watch(isOutside, (val) => {
    if (!autoHideControlsIsland.value) {
      stopAll()
      syncDelayedStates()
      return
    }

    stopAll()

    if (val) {
      // Mouse leave: reset inside state, start hide timer
      isInsideDelayed.value = false
      if (autoHideDelay.value <= 0)
        isOutsideDelayed.value = true
      else
        startHideTimer()
    }
    else {
      // Mouse enter: reset outside state, start show timer
      isOutsideDelayed.value = false
      if (autoShowDelay.value <= 0)
        isInsideDelayed.value = true
      else
        startShowTimer()
    }
  })

  watch(autoHideControlsIsland, (enabled) => {
    stopAll()
    syncDelayedStates()
  })

  const hiddenOpacity = computed(() => autoHideOpacity.value / 100)

  const isHidden = computed(() => {
    if (!autoHideControlsIsland.value)
      return false

    if (isBlocked.value || expanded.value)
      return false

    if (!isOutside.value)
      return autoShowDelay.value > 0 ? !isInsideDelayed.value : false

    return isOutsideDelayed.value
  })

  return {
    isOutsideDelayed,
    isInsideDelayed,
    isHidden,
    hiddenOpacity,
    stopAll,
  }
}
