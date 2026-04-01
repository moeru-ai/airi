import { useTimeoutFn } from '@vueuse/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, watch } from 'vue'

import { useSettingsControlsIsland } from './controls-island'

// Helper to wait for a duration
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('controls-island auto-hide logic with useTimeoutFn', () => {
  beforeEach(() => {
    vi.useRealTimers()
    const pinia = createPinia()
    setActivePinia(pinia)
  })

  // =============================================================================
  // Pinia Store Tests
  // =============================================================================

  describe('pinia store: useSettingsControlsIsland', () => {
    it('should have correct default values', () => {
      const store = useSettingsControlsIsland()

      expect(store.autoHideControlsIsland).toBe(false)
      expect(store.autoHideDelay).toBe(0.5)
      expect(store.autoShowDelay).toBe(0.5)
      expect(store.autoHideOpacity).toBe(30)
    })

    it('should update store values', () => {
      const store = useSettingsControlsIsland()

      store.autoHideControlsIsland = true
      store.autoHideDelay = 2
      store.autoShowDelay = 1.5
      store.autoHideOpacity = 50

      expect(store.autoHideControlsIsland).toBe(true)
      expect(store.autoHideDelay).toBe(2)
      expect(store.autoShowDelay).toBe(1.5)
      expect(store.autoHideOpacity).toBe(50)
    })

    it('should calculate delay based on autoHideControlsIsland flag', () => {
      const store = useSettingsControlsIsland()

      // Default: autoHideControlsIsland = false, so delay = 1500ms
      const delayWhenDisabled = computed(() =>
        store.autoHideControlsIsland ? store.autoHideDelay * 1000 : 1500,
      )
      expect(delayWhenDisabled.value).toBe(1500)

      // Enable auto-hide
      store.autoHideControlsIsland = true
      store.autoHideDelay = 2
      const delayWhenEnabled = computed(() =>
        store.autoHideControlsIsland ? store.autoHideDelay * 1000 : 1500,
      )
      expect(delayWhenEnabled.value).toBe(2000)
    })

    it('should update delay values reactively', () => {
      const store = useSettingsControlsIsland()

      const autoHideDelayMs = computed(() => store.autoHideDelay * 1000)
      expect(autoHideDelayMs.value).toBe(500)

      store.autoHideDelay = 1
      expect(autoHideDelayMs.value).toBe(1000)

      store.autoHideDelay = 0.2
      expect(autoHideDelayMs.value).toBe(200)
    })
  })

  // =============================================================================
  // useTimeoutFn behavior tests with store
  // =============================================================================

  describe('useTimeoutFn responds to delay from store', () => {
    it('should use new delay when store delay changes', async () => {
      const store = useSettingsControlsIsland()
      store.autoHideDelay = 0.2 // 200ms

      const isOutsideDelayed = ref(false)
      const autoHideDelayMs = computed(() => store.autoHideDelay * 1000)

      const { start, stop } = useTimeoutFn(() => {
        isOutsideDelayed.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      // Start timer
      start()

      // Before timer fires, change delay
      await wait(100)
      store.autoHideDelay = 0.5 // Change to 500ms
      stop()
      start() // Restart with new delay

      // At 400ms (old delay 200ms) - should still be false
      await wait(300) // 400ms total
      expect(isOutsideDelayed.value).toBe(false)

      // At 600ms total (new delay 500ms from change) - should be true
      await wait(300) // 700ms total
      expect(isOutsideDelayed.value).toBe(true)
    })

    it('should stop and restart correctly when isOutside changes', async () => {
      const store = useSettingsControlsIsland()
      store.autoHideDelay = 0.2
      store.autoShowDelay = 0.2

      const isOutside = ref(false)
      const isOutsideDelayed = ref(false)
      const isInsideDelayed = ref(true)

      const autoHideDelayMs = computed(() => store.autoHideDelay * 1000)
      const autoShowDelayMs = computed(() => store.autoShowDelay * 1000)

      const { start: startOutside, stop: stopOutside } = useTimeoutFn(() => {
        isOutsideDelayed.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      const { start: startInside, stop: stopInside } = useTimeoutFn(() => {
        isInsideDelayed.value = true
      }, () => autoShowDelayMs.value, { immediate: false })

      // Mouse leaves - start outside timer
      isOutside.value = true
      isInsideDelayed.value = false
      stopOutside()
      stopInside()
      startOutside()

      // Before timer fires, mouse enters - switch timers
      await wait(100)
      isOutside.value = false
      isOutsideDelayed.value = false
      stopOutside()
      stopInside()
      startInside()

      // At 200ms - outside timer should not have fired (was stopped)
      await wait(200)
      expect(isOutsideDelayed.value).toBe(false)

      // At 300ms - inside timer should have fired
      await wait(100)
      expect(isInsideDelayed.value).toBe(true)
    })
  })

  // =============================================================================
  // Integration tests with real store and useTimeoutFn
  // =============================================================================

  describe('integration: auto-hide island with store', () => {
    it('should hide after configured delay when mouse leaves', async () => {
      const store = useSettingsControlsIsland()
      store.autoHideControlsIsland = true
      store.autoHideDelay = 0.3 // 300ms
      store.autoShowDelay = 0.3

      const isOutside = ref(false) // Mouse inside
      const isOutsideDelayed = ref(false)
      const isInsideDelayed = ref(true)

      const autoHideDelayMs = computed(() => store.autoHideDelay * 1000)
      const autoShowDelayMs = computed(() => store.autoShowDelay * 1000)

      const { start: startOutside, stop: stopOutside } = useTimeoutFn(() => {
        isOutsideDelayed.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      const { start: startInside, stop: stopInside } = useTimeoutFn(() => {
        isInsideDelayed.value = true
      }, () => autoShowDelayMs.value, { immediate: false })

      // Simulate component watch behavior
      watch(isOutside, (val) => {
        if (!store.autoHideControlsIsland) {
          stopOutside()
          stopInside()
          isOutsideDelayed.value = val
          isInsideDelayed.value = !val
          return
        }
        stopOutside()
        stopInside()
        if (val) {
          isInsideDelayed.value = false
          startOutside()
        }
        else {
          isOutsideDelayed.value = false
          startInside()
        }
      })

      // Initial: mouse inside
      expect(isOutsideDelayed.value).toBe(false)
      expect(isInsideDelayed.value).toBe(true)

      // Mouse leaves
      isOutside.value = true

      // Before delay - should still be visible
      await wait(250)
      expect(isOutsideDelayed.value).toBe(false)

      // After delay (300ms) - should be hidden
      await wait(100)
      expect(isOutsideDelayed.value).toBe(true)
    })

    it('should show after configured delay when mouse enters', async () => {
      const store = useSettingsControlsIsland()
      store.autoHideControlsIsland = true
      store.autoHideDelay = 0.3
      store.autoShowDelay = 0.3

      const isOutside = ref(true) // Mouse outside
      const isOutsideDelayed = ref(true)
      const isInsideDelayed = ref(false)

      const autoHideDelayMs = computed(() => store.autoHideDelay * 1000)
      const autoShowDelayMs = computed(() => store.autoShowDelay * 1000)

      const { start: startOutside, stop: stopOutside } = useTimeoutFn(() => {
        isOutsideDelayed.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      const { start: startInside, stop: stopInside } = useTimeoutFn(() => {
        isInsideDelayed.value = true
      }, () => autoShowDelayMs.value, { immediate: false })

      // Simulate component watch behavior
      watch(isOutside, (val) => {
        if (!store.autoHideControlsIsland) {
          stopOutside()
          stopInside()
          isOutsideDelayed.value = val
          isInsideDelayed.value = !val
          return
        }
        stopOutside()
        stopInside()
        if (val) {
          isInsideDelayed.value = false
          startOutside()
        }
        else {
          isOutsideDelayed.value = false
          startInside()
        }
      })

      // Initial: mouse outside
      expect(isOutsideDelayed.value).toBe(true)
      expect(isInsideDelayed.value).toBe(false)

      // Mouse enters
      isOutside.value = false

      // Before delay - should still be hidden
      await wait(250)
      expect(isInsideDelayed.value).toBe(false)

      // After delay (300ms) - should be shown
      await wait(100)
      expect(isInsideDelayed.value).toBe(true)
    })

    it('should use 1500ms fallback when autoHideControlsIsland is false', async () => {
      const store = useSettingsControlsIsland()
      store.autoHideControlsIsland = false
      store.autoHideDelay = 0.5

      const _isOutside = ref(true) // Mouse outside
      const isOutsideDelayed = ref(true)

      const autoHideDelayMs = computed(() =>
        store.autoHideControlsIsland ? store.autoHideDelay * 1000 : 1500,
      )

      expect(autoHideDelayMs.value).toBe(1500)

      const { start } = useTimeoutFn(() => {
        isOutsideDelayed.value = false
      }, () => autoHideDelayMs.value, { immediate: false })

      start()

      await wait(1400)
      expect(isOutsideDelayed.value).toBe(true)

      await wait(200)
      expect(isOutsideDelayed.value).toBe(false)
    })

    it('should reset state when autoHideControlsIsland changes', async () => {
      const store = useSettingsControlsIsland()
      store.autoHideControlsIsland = true
      store.autoHideDelay = 0.5

      const isOutside = ref(true) // Mouse outside
      const isOutsideDelayed = ref(true)
      const isInsideDelayed = ref(false)

      const autoHideDelayMs = computed(() => store.autoHideDelay * 1000)

      const { stop: stopOutside } = useTimeoutFn(() => {
        isOutsideDelayed.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      // Simulate watch for autoHideControlsIsland
      watch(() => store.autoHideControlsIsland, () => {
        stopOutside()
        isOutsideDelayed.value = isOutside.value
        isInsideDelayed.value = !isOutside.value
      })

      // Disable auto-hide
      store.autoHideControlsIsland = false

      expect(isOutsideDelayed.value).toBe(true)
      expect(isInsideDelayed.value).toBe(false)
    })

    it('should handle delay update from store correctly', async () => {
      const store = useSettingsControlsIsland()
      store.autoHideControlsIsland = true
      store.autoHideDelay = 0.2

      const isOutside = ref(false)
      const isOutsideDelayed = ref(false)

      const autoHideDelayMs = computed(() => store.autoHideDelay * 1000)

      const { start, stop } = useTimeoutFn(() => {
        isOutsideDelayed.value = true
      }, () => autoHideDelayMs.value, { immediate: false })

      // Mouse leaves
      isOutside.value = true
      start()

      // Change delay before timer fires
      await wait(100)
      store.autoHideDelay = 1 // 1000ms
      stop()
      start() // Restart with new delay

      // At 200ms - original timer would have fired with old delay
      await wait(150) // 250ms total
      expect(isOutsideDelayed.value).toBe(false)

      // At 1200ms total (200ms + 1000ms new delay) - should now fire
      await wait(1000) // 1250ms total
      expect(isOutsideDelayed.value).toBe(true)
    })
  })

  // =============================================================================
  // Collapse behavior tests
  // =============================================================================

  describe('collapse behavior with store', () => {
    it('should collapse after delay when mouse leaves', async () => {
      const store = useSettingsControlsIsland()
      store.autoHideControlsIsland = true
      store.autoHideDelay = 0.3

      const isOutside = ref(false) // Mouse inside
      const expanded = ref(true)
      const isBlocked = ref(false)

      const collapseDelayMs = computed(() =>
        store.autoHideControlsIsland ? store.autoHideDelay * 1000 : 1500,
      )

      const { start, stop } = useTimeoutFn(() => {
        if (expanded.value && !isBlocked.value)
          expanded.value = false
      }, () => collapseDelayMs.value, { immediate: false })

      // Simulate watch for isOutside
      watch(isOutside, (val) => {
        if (val) {
          stop()
          start()
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
      const store = useSettingsControlsIsland()
      store.autoHideControlsIsland = true
      store.autoHideDelay = 0.3

      const isOutside = ref(true)
      const expanded = ref(true)
      const isBlocked = ref(true) // Blocked

      const collapseDelayMs = computed(() =>
        store.autoHideControlsIsland ? store.autoHideDelay * 1000 : 1500,
      )

      const { start, stop } = useTimeoutFn(() => {
        if (expanded.value && !isBlocked.value)
          expanded.value = false
      }, () => collapseDelayMs.value, { immediate: false })

      watch(isOutside, (val) => {
        if (val) {
          stop()
          start()
        }
      })

      isOutside.value = true

      await wait(400)

      // Should still be expanded because blocked
      expect(expanded.value).toBe(true)
    })
  })
})
