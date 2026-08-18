import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@proj-airi/stage-shared/composables', () => {
  function useLocalStorageManualReset<T>(_key: string, initialValue: T) {
    const state = ref(initialValue)
    return Object.assign(state, {
      reset: () => {
        state.value = initialValue
      },
    })
  }

  return {
    useLocalStorageManualReset,
    useVersionedLocalStorageManualReset: useLocalStorageManualReset,
  }
})

describe('useSettingsLive2d', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
  })

  /**
   * @example
   * expect(settings.live2dEyeTracking).toBe(true)
   */
  it('defaults mouse tracking to enabled to preserve the old focus behavior', async () => {
    const { useSettingsLive2d } = await import('./live2d')

    const settings = useSettingsLive2d()

    expect(settings.live2dEyeTracking).toBe(true)
  })

  /**
   * @example
   * expect(settings.live2dForceIdleEyeAnimation).toBe(true)
   */
  it('defaults idle eye animation to enabled to preserve no-cursor idle behavior', async () => {
    const { useSettingsLive2d } = await import('./live2d')

    const settings = useSettingsLive2d()

    expect(settings.live2dForceIdleEyeAnimation).toBe(true)
  })

  /**
   * @example
   * expect(settings.live2dAutoBlinkEnabled).toBe(true)
   */
  it('defaults blink to enabled with forced blink mode', async () => {
    const { useSettingsLive2d } = await import('./live2d')

    const settings = useSettingsLive2d()

    expect(settings.live2dAutoBlinkEnabled).toBe(true)
    expect(settings.live2dForceAutoBlinkEnabled).toBe(true)
  })
})
