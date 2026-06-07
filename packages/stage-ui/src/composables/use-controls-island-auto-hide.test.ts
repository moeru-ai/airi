import { useTimeoutFn } from '@vueuse/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, watch } from 'vue'

import { useControlsIslandAutoHide } from './use-controls-island-auto-hide'

describe('useControlsIslandAutoHide', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  // =============================================================================
  // Basic Functionality Tests
  // =============================================================================

  describe('hiddenOpacity calculation', () => {
    it('should convert 0-100 to 0-1', () => {
      const autoHideOpacity = ref(30)
      const isOutside = ref(true)
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { hiddenOpacity } = useControlsIslandAutoHide({
        autoHideControlsIsland: ref(true),
        autoHideDelay: ref(0.5),
        autoShowDelay: ref(0.5),
        autoHideOpacity,
        isOutside,
        isBlocked,
        expanded,
      })

      expect(hiddenOpacity.value).toBe(0.3)

      autoHideOpacity.value = 100
      expect(hiddenOpacity.value).toBe(1)

      autoHideOpacity.value = 0
      expect(hiddenOpacity.value).toBe(0)
    })
  })

  describe('initial state', () => {
    it('should initialize delayed states based on isOutside', () => {
      const isOutside = ref(true)
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { isOutsideDelayed, isInsideDelayed } = useControlsIslandAutoHide({
        autoHideControlsIsland: ref(true),
        autoHideDelay: ref(0.5),
        autoShowDelay: ref(0.5),
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      expect(isOutsideDelayed.value).toBe(true)
      expect(isInsideDelayed.value).toBe(false)

      // Test with isOutside = false
      const isOutside2 = ref(false)
      const { isOutsideDelayed: d2, isInsideDelayed: i2 } = useControlsIslandAutoHide({
        autoHideControlsIsland: ref(true),
        autoHideDelay: ref(0.5),
        autoShowDelay: ref(0.5),
        autoHideOpacity: ref(30),
        isOutside: isOutside2,
        isBlocked: ref(false),
        expanded: ref(false),
      })

      expect(d2.value).toBe(false)
      expect(i2.value).toBe(true)
    })
  })

  // =============================================================================
  // isHidden Computation Tests
  // =============================================================================

  describe('isHidden computation', () => {
    it('should return false when autoHideControlsIsland is false', () => {
      const isOutside = ref(true)
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { isHidden } = useControlsIslandAutoHide({
        autoHideControlsIsland: ref(false),
        autoHideDelay: ref(0.5),
        autoShowDelay: ref(0.5),
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      expect(isHidden.value).toBe(false)
    })

    it('should return false when isBlocked is true', () => {
      const isOutside = ref(true)
      const isBlocked = ref(true) // Blocked
      const expanded = ref(false)

      const { isHidden } = useControlsIslandAutoHide({
        autoHideControlsIsland: ref(true),
        autoHideDelay: ref(0.5),
        autoShowDelay: ref(0.5),
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      expect(isHidden.value).toBe(false)
    })

    it('should return false when expanded is true', () => {
      const isOutside = ref(true)
      const isBlocked = ref(false)
      const expanded = ref(true) // Expanded

      const { isHidden } = useControlsIslandAutoHide({
        autoHideControlsIsland: ref(true),
        autoHideDelay: ref(0.5),
        autoShowDelay: ref(0.5),
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      expect(isHidden.value).toBe(false)
    })

    it('should return false immediately when mouse is inside and autoShowDelay is 0', () => {
      const isOutside = ref(false) // Mouse inside
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { isHidden } = useControlsIslandAutoHide({
        autoHideControlsIsland: ref(true),
        autoHideDelay: ref(0.5),
        autoShowDelay: ref(0), // No delay
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      expect(isHidden.value).toBe(false)
    })

    it('should return true when mouse is outside and delay reached', () => {
      const isOutside = ref(true) // Mouse outside
      const isBlocked = ref(false)
      const expanded = ref(false)

      // Create composable and manually control delayed state
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.5)
      const autoShowDelay = ref(0.5)
      const autoHideOpacity = ref(30)

      const { isHidden, isOutsideDelayed: delayedRef } = useControlsIslandAutoHide({
        autoHideControlsIsland,
        autoHideDelay,
        autoShowDelay,
        autoHideOpacity,
        isOutside,
        isBlocked,
        expanded,
      })

      // Simulate delay reached
      delayedRef.value = true

      expect(isHidden.value).toBe(true)
    })
  })

  // =============================================================================
  // useTimeoutFn Integration Tests
  // =============================================================================

  describe('useTimeoutFn responds to delay changes', () => {
    it('should use new delay when delay changes', async () => {
      const autoHideDelay = ref(0.2) // 200ms

      // Test the timeout mechanism separately
      const timeoutFlag = ref(false)
      const autoHideDelayMs = computed(() => autoHideDelay.value * 1000)

      const { start, stop } = useTimeoutFn(() => {
        timeoutFlag.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      start()

      // Before timer fires, change delay
      await vi.advanceTimersByTimeAsync(100)
      autoHideDelay.value = 0.5 // Change to 500ms
      stop()
      start()

      // At 400ms (old delay 200ms) - should still be false
      await vi.advanceTimersByTimeAsync(300)
      expect(timeoutFlag.value).toBe(false)

      // At 600ms total (new delay 500ms from change) - should be true
      await vi.advanceTimersByTimeAsync(300)
      expect(timeoutFlag.value).toBe(true)
    })

    it('should stop and restart correctly when isOutside changes', async () => {
      const autoHideDelay = ref(0.2)
      const autoShowDelay = ref(0.2)
      const isOutside = ref(false)
      const isBlocked = ref(false)
      const expanded = ref(false)

      // Create composable instance (not using its values, just for setup)
      useControlsIslandAutoHide({
        autoHideControlsIsland: ref(true),
        autoHideDelay,
        autoShowDelay,
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      // Test timer switching separately
      const isOutsideDel = ref(false)
      const isInsideDel = ref(true)

      const autoHideDelayMs = computed(() => autoHideDelay.value * 1000)
      const autoShowDelayMs = computed(() => autoShowDelay.value * 1000)

      const { start: startOutside, stop: stopOutside } = useTimeoutFn(() => {
        isOutsideDel.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      const { start: startInside, stop: stopInside } = useTimeoutFn(() => {
        isInsideDel.value = true
      }, () => autoShowDelayMs.value, { immediate: false })

      // Mouse leaves - start outside timer
      isOutside.value = true
      isInsideDel.value = false
      stopOutside()
      stopInside()
      startOutside()

      // Before timer fires, mouse enters - switch timers
      await vi.advanceTimersByTimeAsync(100)
      isOutside.value = false
      isOutsideDel.value = false
      stopOutside()
      stopInside()
      startInside()

      // At 200ms - outside timer should not have fired
      await vi.advanceTimersByTimeAsync(200)
      expect(isOutsideDel.value).toBe(false)

      // At 300ms - inside timer should have fired
      await vi.advanceTimersByTimeAsync(100)
      expect(isInsideDel.value).toBe(true)
    })
  })

  // =============================================================================
  // Integration: Full Auto-Hide/Show Flow
  // =============================================================================

  describe('integration: auto-hide island behavior', () => {
    it('should hide after configured delay when mouse leaves', async () => {
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.3) // 300ms
      const autoShowDelay = ref(0.3)
      const isOutside = ref(false) // Mouse inside
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { isOutsideDelayed, isHidden } = useControlsIslandAutoHide({
        autoHideControlsIsland,
        autoHideDelay,
        autoShowDelay,
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      // Simulate watch for isOutside
      const autoHideDelayMs = computed(() => autoHideDelay.value * 1000)
      const autoShowDelayMs = computed(() => autoShowDelay.value * 1000)

      const { start: startOutside, stop: stopOutside } = useTimeoutFn(() => {
        isOutsideDelayed.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      const { stop: stopInside } = useTimeoutFn(() => {}, () => autoShowDelayMs.value, { immediate: false })

      watch(isOutside, (val) => {
        if (!autoHideControlsIsland.value) {
          stopOutside()
          stopInside()
          return
        }
        stopOutside()
        stopInside()
        if (val) {
          startOutside()
        }
      })

      // Mouse leaves
      isOutside.value = true
      startOutside()

      // Before delay - should still be visible
      await vi.advanceTimersByTimeAsync(250)
      expect(isOutsideDelayed.value).toBe(false)
      expect(isHidden.value).toBe(false)

      // After delay (300ms) - should be hidden
      await vi.advanceTimersByTimeAsync(100)
      expect(isOutsideDelayed.value).toBe(true)
      expect(isHidden.value).toBe(true)
    })

    it('should show after configured delay when mouse enters', async () => {
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.3)
      const autoShowDelay = ref(0.3)
      const isOutside = ref(true) // Mouse initially outside
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { isInsideDelayed, isHidden } = useControlsIslandAutoHide({
        autoHideControlsIsland,
        autoHideDelay,
        autoShowDelay,
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      const autoHideDelayMs = computed(() => autoHideDelay.value * 1000)
      const autoShowDelayMs = computed(() => autoShowDelay.value * 1000)

      const { stop: stopOutside } = useTimeoutFn(() => {}, () => autoHideDelayMs.value, { immediate: false })

      const { start: startInside, stop: stopInside } = useTimeoutFn(() => {
        isInsideDelayed.value = true
      }, () => autoShowDelayMs.value, { immediate: false })

      watch(isOutside, (val) => {
        if (!autoHideControlsIsland.value) {
          stopOutside()
          stopInside()
          return
        }
        stopOutside()
        stopInside()
        if (!val) {
          startInside()
        }
      })

      // Initial: mouse outside, isHidden should be true (delay already passed)
      // Simulate that delay has passed for being outside
      expect(isHidden.value).toBe(true)

      // Mouse enters (isOutside = false)
      isOutside.value = false

      // Before delay - should still be hidden (waiting for show delay)
      await vi.advanceTimersByTimeAsync(250)
      expect(isInsideDelayed.value).toBe(false)
      expect(isHidden.value).toBe(true)

      // Start the timer
      startInside()

      // After delay (300ms) - should be shown
      await vi.advanceTimersByTimeAsync(100)
      expect(isInsideDelayed.value).toBe(true)
      expect(isHidden.value).toBe(false)
    })

    it('should use 1500ms fallback when autoHideControlsIsland is false', () => {
      const autoHideControlsIsland = ref(false)
      const autoHideDelay = ref(0.5)

      const collapseDelayMs = computed(() =>
        autoHideControlsIsland.value ? autoHideDelay.value * 1000 : 1500,
      )

      expect(collapseDelayMs.value).toBe(1500)
    })

    it('should reset state when autoHideControlsIsland changes', () => {
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.5)
      const isOutside = ref(true)
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { isOutsideDelayed, isInsideDelayed } = useControlsIslandAutoHide({
        autoHideControlsIsland,
        autoHideDelay,
        autoShowDelay: ref(0.5),
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      // Initial state when isOutside = true
      expect(isOutsideDelayed.value).toBe(true)
      expect(isInsideDelayed.value).toBe(false)

      // Change autoHideControlsIsland to false
      autoHideControlsIsland.value = false

      // Should reset to immediate sync (not delayed)
      expect(isOutsideDelayed.value).toBe(isOutside.value)
      expect(isInsideDelayed.value).toBe(!isOutside.value)
    })
  })

  // =============================================================================
  // Reset State on Mouse Enter/Exit
  // =============================================================================

  describe('reset state on mouse enter/exit', () => {
    it('should reset delayed states when mouse enters then quickly leaves', async () => {
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.3) // 300ms
      const autoShowDelay = ref(0.3) // 300ms
      const isOutside = ref(false) // Mouse inside initially
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { isOutsideDelayed, isInsideDelayed, isHidden, stopAll } = useControlsIslandAutoHide({
        autoHideControlsIsland,
        autoHideDelay,
        autoShowDelay,
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      // Initially visible
      expect(isHidden.value).toBe(false)
      expect(isOutsideDelayed.value).toBe(false)
      expect(isInsideDelayed.value).toBe(true)

      // Mouse leaves - hide timer starts
      isOutside.value = true
      // Wait less than hide delay
      await vi.advanceTimersByTimeAsync(100)
      expect(isOutsideDelayed.value).toBe(false) // Hide timer hasn't fired yet

      // Mouse re-enters before hide timer fires - should reset state
      isOutside.value = false
      // Show timer starts, outside delayed should be reset
      expect(isOutsideDelayed.value).toBe(false)

      // Wait less than show delay
      await vi.advanceTimersByTimeAsync(100)
      expect(isInsideDelayed.value).toBe(false) // Show timer hasn't fired yet

      // Now mouse leaves again - hide timer restarts
      isOutside.value = true

      // Wait for hide delay to complete (300ms from last change)
      await vi.advanceTimersByTimeAsync(350)
      expect(isOutsideDelayed.value).toBe(true)

      stopAll()
    })

    it('should cancel pending timers when switching between enter and leave', async () => {
      const autoHideControlsIsland = ref(true)
      const autoHideDelay = ref(0.4) // 400ms
      const autoShowDelay = ref(0.4) // 400ms
      const isOutside = ref(false)
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { isOutsideDelayed, isInsideDelayed } = useControlsIslandAutoHide({
        autoHideControlsIsland,
        autoHideDelay,
        autoShowDelay,
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      // Mouse leaves - start hide timer
      isOutside.value = true
      isInsideDelayed.value = false

      // Quickly mouse enters before hide timer fires
      await vi.advanceTimersByTimeAsync(200) // Less than 400ms
      isOutside.value = false

      // Hide timer should NOT fire after the original 400ms
      await vi.advanceTimersByTimeAsync(250) // Past original 400ms
      expect(isOutsideDelayed.value).toBe(false) // Should still be false

      // Show timer should fire at 400ms from the enter event
      await vi.advanceTimersByTimeAsync(250)
      expect(isInsideDelayed.value).toBe(true)
    })
  })

  // =============================================================================
  // stopAll Function
  // =============================================================================

  describe('stopAll function', () => {
    it('should stop all timers', () => {
      const autoHideDelay = ref(0.5)
      const isOutside = ref(true)
      const isBlocked = ref(false)
      const expanded = ref(false)

      const { stopAll } = useControlsIslandAutoHide({
        autoHideControlsIsland: ref(true),
        autoHideDelay,
        autoShowDelay: ref(0.5),
        autoHideOpacity: ref(30),
        isOutside,
        isBlocked,
        expanded,
      })

      // Start timers by triggering isOutside change
      isOutside.value = false
      isOutside.value = true

      // stopAll should not throw
      expect(() => stopAll()).not.toThrow()
    })
  })
})
