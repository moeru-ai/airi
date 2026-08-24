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

  it('maps cursor displacement to a small model offset with twice the vertical rate', async () => {
    const { getLive2DModelMouseOffset } = await import('./eye-tracking')

    // ROOT CAUSE:
    //
    // A 0.04 ratio moved the model only 8 px from the center to the edge of a
    // 400 px canvas. The transform was active, but the movement was hard to see.
    // Use 20 px horizontal travel and twice that vertical travel for the same
    // cursor displacement.
    expect(getLive2DModelMouseOffset(
      { x: 400, y: 400 },
      { left: 0, top: 0, width: 400, height: 400 },
    )).toEqual({ x: -20, y: 40 })
    expect(getLive2DModelMouseOffset(
      { x: 200, y: 200 },
      { left: 0, top: 0, width: 400, height: 400 },
    )).toEqual({ x: 0, y: 0 })
  })

  it('does not offset the model without valid tracking geometry', async () => {
    const { getLive2DModelMouseOffset } = await import('./eye-tracking')

    expect(getLive2DModelMouseOffset(null, undefined)).toEqual({ x: 0, y: 0 })
    expect(getLive2DModelMouseOffset(
      { x: 500, y: 500 },
      { left: 0, top: 0, width: 0, height: 1000 },
    )).toEqual({ x: 0, y: 0 })
  })
})
