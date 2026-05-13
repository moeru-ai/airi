import type { Ref } from 'vue'

import { useTimeoutFn } from '@vueuse/core'
import { computed } from 'vue'

/** Fallback collapse delay when autoHideControlsIsland is disabled (ms) */
const DEFAULT_COLLAPSE_DELAY_MS = 1500

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
    autoHideControlsIsland.value ? autoHideDelay.value * 1000 : DEFAULT_COLLAPSE_DELAY_MS,
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
