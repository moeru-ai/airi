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
 * Handles delayed hide/show based on mouse position and configurable delays.
 */
export function useControlsIslandAutoHide(options: UseControlsIslandAutoHideOptions): UseControlsIslandAutoHideReturn {
  const { autoHideControlsIsland, autoHideDelay, autoShowDelay, autoHideOpacity, isOutside, isBlocked, expanded } = options

  // Delayed states that respond to both value AND delay configuration changes
  const isOutsideDelayed = ref(isOutside.value)
  const isInsideDelayed = ref(!isOutside.value)

  // --- Auto-hide island (only works when autoHideControlsIsland = true) ---
  const { start: startOutside, stop: stopOutside } = useTimeoutFn(() => {
    isOutsideDelayed.value = true
  }, () => autoHideDelay.value * 1000, { immediate: false })

  const { start: startInside, stop: stopInside } = useTimeoutFn(() => {
    isInsideDelayed.value = true
  }, () => autoShowDelay.value * 1000, { immediate: false })

  // Watch mouse position changes
  watch(isOutside, (val) => {
    if (!autoHideControlsIsland.value) {
      // Not in auto-hide mode, reset states
      stopOutside()
      stopInside()
      isOutsideDelayed.value = val
      isInsideDelayed.value = !val
      return
    }
    stopOutside()
    stopInside()
    if (val) {
      // Mouse left - start hide delay timer
      isInsideDelayed.value = false
      startOutside()
    }
    else {
      // Mouse entered - start show delay timer
      isOutsideDelayed.value = false
      startInside()
    }
  })

  // Reset all states when autoHideControlsIsland toggles
  watch(autoHideControlsIsland, () => {
    stopOutside()
    stopInside()
    isOutsideDelayed.value = isOutside.value
    isInsideDelayed.value = !isOutside.value
  })

  // Calculate opacity when hidden (0-100 range converted to 0-1)
  const hiddenOpacity = computed(() => autoHideOpacity.value / 100)

  // Determine if island should be hidden
  const isHidden = computed(() => {
    if (!autoHideControlsIsland.value)
      return false

    // Don't hide if there's a blocking overlay or expanded panel should stay
    if (isBlocked.value || expanded.value)
      return false

    // When mouse is inside, wait for show delay before fully showing
    if (!isOutside.value) {
      if (autoShowDelay.value > 0) {
        // Wait for mouse to be inside for the configured delay before showing
        return !isInsideDelayed.value
      }
      return false
    }

    // When mouse is outside, hide after delay
    return isOutsideDelayed.value
  })

  const stopAll = () => {
    stopOutside()
    stopInside()
  }

  return {
    isOutsideDelayed,
    isInsideDelayed,
    isHidden,
    hiddenOpacity,
    stopAll,
  }
}
