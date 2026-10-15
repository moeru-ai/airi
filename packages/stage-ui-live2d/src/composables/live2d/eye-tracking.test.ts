import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

describe('useLive2DEyeFocusFor', () => {
  it('maps a plain tracking source into Live2D render coordinates', async () => {
    const { useLive2DEyeFocusFor } = await import('./eye-tracking')

    const canvas = {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as HTMLCanvasElement
    const focus = useLive2DEyeFocusFor({
      canvas: () => canvas,
      model: () => ({ normalizedScale: 1, modelWidth: 1000, modelHeight: 1000 }),
      source: () => ({ x: 110, y: 70 }),
      renderScale: () => 2,
      modelScale: () => 1,
      eyeOffset: () => ({ x: 0, y: 0 }),
    })

    await nextTick()

    expect(focus.value).toEqual({ x: 200, y: 100 })
  })

  it('returns an off-canvas focus target when tracking source is absent', async () => {
    const { useLive2DEyeFocusFor } = await import('./eye-tracking')

    const canvas = {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as HTMLCanvasElement
    const focus = useLive2DEyeFocusFor({
      canvas: () => canvas,
      model: () => ({ normalizedScale: 1, modelWidth: 1000, modelHeight: 1000 }),
      source: () => null,
      renderScale: () => 2,
      modelScale: () => 1,
      eyeOffset: () => ({ x: 0, y: 0 }),
    })

    await nextTick()

    expect(focus.value).toEqual({ x: 1000, y: 1000 })
  })
})
