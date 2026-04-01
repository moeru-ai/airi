import type { Ref } from 'vue'

import { useTimeoutFn } from '@vueuse/core'
import { computed } from 'vue'

export interface UseControlsIslandCollapseOptions {
  /** Delay in seconds before collapsing */
  autoHideDelay: Ref<number>
  /** Whether auto-hide is enabled */
  autoHideControlsIsland: Ref<boolean>
  /** Whether the panel is expanded */
  expanded: Ref<boolean>
  /** Whether there's a blocking overlay */
  isBlocked: Ref<boolean>
}

export interface UseControlsIslandCollapseReturn {
  /** Start the collapse timer */
  startCollapse: () => void
  /** Stop the collapse timer */
  stopCollapse: () => void
  collapseDelayMs: Ref<number>
}

/**
 * Composable for controls island auto-collapse behavior.
 * Collapses the expanded panel after a delay when mouse leaves.
 */
export function useControlsIslandCollapse(options: UseControlsIslandCollapseOptions): UseControlsIslandCollapseReturn {
  const { autoHideDelay, autoHideControlsIsland, expanded, isBlocked } = options

  const collapseDelayMs = computed(() =>
    autoHideControlsIsland.value ? autoHideDelay.value * 1000 : 1500,
  )

  const { start: startCollapse, stop: stopCollapse } = useTimeoutFn(() => {
    if (expanded.value && !isBlocked.value)
      expanded.value = false
  }, () => collapseDelayMs.value, { immediate: false })

  return {
    startCollapse,
    stopCollapse,
    collapseDelayMs,
  }
}
