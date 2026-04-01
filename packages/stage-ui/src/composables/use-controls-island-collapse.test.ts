import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'

import { useControlsIslandCollapse } from './use-controls-island-collapse'

// Helper to wait for a duration
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
// =============================================================================
// useControlsIslandCollapse Tests
// =============================================================================

describe('useControlsIslandCollapse', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  describe('collapseDelayMs calculation', () => {
    it('should use autoHideDelay * 1000 when enabled', () => {
      const autoHideDelay = ref(0.5)
      const autoHideControlsIsland = ref(true)
      const expanded = ref(true)
      const isBlocked = ref(false)

      const { collapseDelayMs } = useControlsIslandCollapse({
        autoHideDelay,
        autoHideControlsIsland,
        expanded,
        isBlocked,
      })

      expect(collapseDelayMs.value).toBe(500)
    })

    it('should use 1500ms fallback when disabled', () => {
      const autoHideDelay = ref(0.5)
      const autoHideControlsIsland = ref(false)
      const expanded = ref(true)
      const isBlocked = ref(false)

      const { collapseDelayMs } = useControlsIslandCollapse({
        autoHideDelay,
        autoHideControlsIsland,
        expanded,
        isBlocked,
      })

      expect(collapseDelayMs.value).toBe(1500)
    })
  })

  describe('collapse behavior', () => {
    it('should collapse after delay when mouse leaves', async () => {
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.3)
      const isOutside = ref(false) // Mouse inside
      const expanded = ref(true)
      const isBlocked = ref(false)

      const { startCollapse, stopCollapse } = useControlsIslandCollapse({
        autoHideDelay,
        autoHideControlsIsland,
        expanded,
        isBlocked,
      })

      // Simulate watch for isOutside
      watch(isOutside, (val) => {
        if (val) {
          stopCollapse()
          startCollapse()
        }
      })

      // Mouse leaves
      isOutside.value = true

      // Before delay - should still be expanded
      await wait(250)
      expect(expanded.value).toBe(true)

      // After delay - should be collapsed
      await wait(100)
      expect(expanded.value).toBe(false)
    })

    it('should not collapse when blocked', async () => {
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.3)
      const isOutside = ref(true)
      const expanded = ref(true)
      const isBlocked = ref(true) // Blocked

      const { startCollapse, stopCollapse } = useControlsIslandCollapse({
        autoHideDelay,
        autoHideControlsIsland,
        expanded,
        isBlocked,
      })

      watch(isOutside, (val) => {
        if (val) {
          stopCollapse()
          startCollapse()
        }
      })

      isOutside.value = true

      await wait(400)

      // Should still be expanded because blocked
      expect(expanded.value).toBe(true)
    })
  })
})
