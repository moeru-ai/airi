import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useCanvasPixelAtPoint } from './canvas-alpha'

vi.mock('@vueuse/core', async () => {
  const vue = await import('vue')

  return {
    toRef: (value: unknown) => vue.isRef(value) ? value : vue.ref(value),
    unrefElement: (value: unknown) => vue.unref(value),
    useElementBounding: () => ({
      left: vue.ref(10),
      top: vue.ref(20),
      width: vue.ref(100),
      height: vue.ref(100),
    }),
  }
})

describe('useCanvasPixelAtPoint', () => {
  it('flips the Y coordinate before reading the WebGL pixel', () => {
    const readPixels = vi.fn((_x, _y, _width, _height, _format, _type, data: Uint8Array) => {
      data[3] = 255
    })
    const gl = {
      drawingBufferWidth: 200,
      drawingBufferHeight: 100,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      readPixels,
    }
    const canvas = {
      getContext: vi.fn(() => gl),
    } as unknown as HTMLCanvasElement

    const { pixel } = useCanvasPixelAtPoint(ref(canvas), ref(60), ref(30))

    expect(Array.from(pixel.value)).toEqual([0, 0, 0, 255])
    expect(readPixels).toHaveBeenCalledWith(100, 89, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, expect.any(Uint8Array))
  })

  // The two readers differ only here: a 2D context counts rows downward from the top,
  // where WebGL counts upward from the bottom. Nothing in the types catches a flip.
  it('reads the 2D pixel at the same row the cursor is on', () => {
    const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }))
    const canvas = {
      width: 200,
      height: 100,
      getContext: vi.fn(() => ({ getImageData })),
    } as unknown as HTMLCanvasElement

    const { pixel } = useCanvasPixelAtPoint(ref(canvas), ref(60), ref(30), '2d')

    expect(Array.from(pixel.value)).toEqual([1, 2, 3, 255])
    expect(getImageData).toHaveBeenCalledWith(100, 10, 1, 1)
  })

  it('asks for the context it was told to use, never the other one', () => {
    const getContext = vi.fn(() => null)
    const canvas = { width: 200, height: 100, getContext } as unknown as HTMLCanvasElement

    useCanvasPixelAtPoint(ref(canvas), ref(60), ref(30), '2d').pixel.value

    expect(getContext).toHaveBeenCalledTimes(1)
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
  })
})
