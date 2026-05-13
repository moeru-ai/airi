import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'

import { useControlsIslandCollapse } from './use-controls-island-collapse'

// =============================================================================
// useControlsIslandCollapse Tests
// =============================================================================

describe('useControlsIslandCollapse', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
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
      await vi.advanceTimersByTimeAsync(250)
      expect(expanded.value).toBe(true)

      // After delay - should be collapsed
      await vi.advanceTimersByTimeAsync(100)
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

      await vi.advanceTimersByTimeAsync(400)

      // Should still be expanded because blocked
      expect(expanded.value).toBe(true)
    })
  })

  // =============================================================================
  // Re-arm Collapse on Unblock While Still Outside
  // =============================================================================

  describe('re-arm on unblock while still outside', () => {
    it('should collapse after overlay closes when mouse stayed outside (PR #1534)', async () => {
      // Regression for https://github.com/moeru-ai/airi/pull/1534#discussion_r3215076635
      //
      // ROOT CAUSE:
      //
      // The call-site watcher only reacted to `isOutside`:
      //   watch(isOutside, val => { stopCollapse(); if (val) startCollapse() })
      // When `isBlocked` flipped to true mid-flight, the timer still fired but
      // the callback no-op'd due to the `!isBlocked` guard, consuming the
      // schedule. When `isBlocked` later flipped back to false with the mouse
      // still outside, nothing re-scheduled the timer and the panel stayed
      // expanded indefinitely.
      //
      // We fixed this by watching [isOutside, isBlocked] together so that
      // unblocking while still outside re-arms the collapse timer.
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.3) // 300ms
      const isOutside = ref(false)
      const expanded = ref(true)
      const isBlocked = ref(false)

      const { startCollapse, stopCollapse } = useControlsIslandCollapse({
        autoHideDelay,
        autoHideControlsIsland,
        expanded,
        isBlocked,
      })

      // Mirror the fixed call-site watch from controls-island/index.vue
      watch([isOutside, isBlocked], ([outside, blocked]) => {
        stopCollapse()
        if (outside && !blocked)
          startCollapse()
      })

      // 1) Mouse leaves -> timer armed
      isOutside.value = true
      await vi.advanceTimersByTimeAsync(100)
      expect(expanded.value).toBe(true)

      // 2) Overlay opens before timer fires -> timer is cancelled
      isBlocked.value = true
      await vi.advanceTimersByTimeAsync(400) // well past 300ms delay
      expect(expanded.value).toBe(true)

      // 3) Overlay closes, mouse still outside -> timer must re-arm
      isBlocked.value = false
      await vi.advanceTimersByTimeAsync(250) // not yet past delay
      expect(expanded.value).toBe(true)

      await vi.advanceTimersByTimeAsync(100) // now past 300ms
      expect(expanded.value).toBe(false)
    })

    it('should not collapse when overlay closes after mouse re-entered', async () => {
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.3)
      const isOutside = ref(true)
      const expanded = ref(true)
      const isBlocked = ref(true)

      const { startCollapse, stopCollapse } = useControlsIslandCollapse({
        autoHideDelay,
        autoHideControlsIsland,
        expanded,
        isBlocked,
      })

      watch([isOutside, isBlocked], ([outside, blocked]) => {
        stopCollapse()
        if (outside && !blocked)
          startCollapse()
      })

      // Mouse moves back inside while overlay is still open
      isOutside.value = false
      // Then overlay closes
      isBlocked.value = false

      await vi.advanceTimersByTimeAsync(500)
      expect(expanded.value).toBe(true) // must stay expanded; mouse is inside
    })
  })
})
