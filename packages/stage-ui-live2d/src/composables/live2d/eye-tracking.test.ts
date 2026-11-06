import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

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

vi.mock('@vueuse/core', async () => {
  const vue = await import('vue')
  return {
    useLocalStorage: vi.fn((_key, initialValue) => vue.ref(initialValue)),
  }
})

describe('useLive2DEyeFocusFor', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
  })

  /**
   * @example
   * expect(focus.value).toEqual({ x: 200, y: 100 })
   */
  it('maps a plain tracking source into Live2D render coordinates', async () => {
    const { useSettingsLive2d } = await import('./live2d')
    const { useLive2DEyeFocusFor } = await import('./eye-tracking')

    const settings = useSettingsLive2d()
    settings.live2dRenderScale = 2

    const canvas = {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as HTMLCanvasElement
    const focus = useLive2DEyeFocusFor({
      canvas: () => canvas,
      model: () => ({ normalizedScale: 1, modelWidth: 1000, modelHeight: 1000 }),
      source: () => ({ x: 110, y: 70 }),
    })

    await nextTick()

    expect(focus.value).toEqual({ x: 200, y: 100 })
  })

  /**
   * @example
   * expect(focus.value).toEqual({ x: 1000, y: 1000 })
   */
  it('returns an off-canvas focus target when tracking source is absent', async () => {
    const { useLive2DEyeFocusFor } = await import('./eye-tracking')

    const canvas = {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as HTMLCanvasElement
    const focus = useLive2DEyeFocusFor({
      canvas: () => canvas,
      model: () => ({ normalizedScale: 1, modelWidth: 1000, modelHeight: 1000 }),
      source: () => null,
    })

    await nextTick()

    expect(focus.value).toEqual({ x: 1000, y: 1000 })
  })
})

describe('resolveLive2DFocusTargetMode', () => {
  it('centers the target when neither the cursor nor the idle focus drives it', async () => {
    const { resolveLive2DFocusTargetMode } = await import('./eye-tracking')

    // ROOT CAUSE:
    //
    // Pixi adds the last focus target to the head angles on every frame. Turning
    // off mouse tracking and idle eye movement kept that target, so the model
    // and MAGIC poses stayed turned.
    //
    // We fixed this by centering the target.
    expect(resolveLive2DFocusTargetMode({ eyeTracking: false, sourceActive: true, idleEyeFocus: false })).toBe('center')
    expect(resolveLive2DFocusTargetMode({ eyeTracking: true, sourceActive: false, idleEyeFocus: false })).toBe('center')
  })

  it('follows an active cursor before the idle focus', async () => {
    const { resolveLive2DFocusTargetMode } = await import('./eye-tracking')

    expect(resolveLive2DFocusTargetMode({ eyeTracking: true, sourceActive: true, idleEyeFocus: true })).toBe('follow')
    expect(resolveLive2DFocusTargetMode({ eyeTracking: true, sourceActive: false, idleEyeFocus: true })).toBe('idle')
  })
})
