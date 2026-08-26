import { describe, expect, it } from 'vitest'

import { isCanvasRegionTransparent } from './canvas-alpha'

interface GlMockOptions {
  height?: number
  hotPixel?: { alpha?: number, x: number, y: number }
  width?: number
}

/**
 * Minimal WebGL context mock that fills readPixels output with transparent pixels,
 * except for an optional single hot pixel where alpha is set. Coordinates are in
 * drawing buffer space, matching readPixels inputs.
 */
function createGlMock(options: GlMockOptions = {}) {
  const drawingBufferWidth = options.width ?? 100
  const drawingBufferHeight = options.height ?? 100
  const hotPixel = options.hotPixel

  const gl = {
    drawingBufferHeight,
    drawingBufferWidth,
    readPixels: (
      startX: number,
      startY: number,
      readWidth: number,
      readHeight: number,
      _format: number,
      _type: number,
      data: Uint8Array,
    ) => {
      data.fill(0)

      if (!hotPixel)
        return

      const { alpha = 255, x, y } = hotPixel
      const withinX = x >= startX && x < startX + readWidth
      const withinY = y >= startY && y < startY + readHeight
      if (!withinX || !withinY)
        return

      const relX = x - startX
      const relY = y - startY
      const index = (relY * readWidth + relX) * 4 + 3
      data[index] = alpha
    },
  }

  return gl as unknown as WebGLRenderingContext
}

describe('isCanvasRegionTransparent', () => {
  it('returns true when cursor is outside canvas bounds', () => {
    const gl = createGlMock()

    const result = isCanvasRegionTransparent({
      clientX: 150,
      clientY: 150,
      gl,
      height: 100,
      left: 0,
      radius: 10,
      threshold: 10,
      top: 0,
      width: 100,
    })

    expect(result).toBe(true)
  })

  it('returns false when an opaque pixel is inside the circular region', () => {
    const gl = createGlMock({ hotPixel: { alpha: 255, x: 50, y: 49 } })

    const result = isCanvasRegionTransparent({
      clientX: 50,
      clientY: 50,
      gl,
      height: 100,
      left: 0,
      radius: 10,
      threshold: 10,
      top: 0,
      width: 100,
    })

    expect(result).toBe(false)
  })

  it('ignores opaque pixels outside the circular region but inside read bounds', () => {
    const gl = createGlMock({ hotPixel: { alpha: 255, x: 80, y: 80 } })

    const result = isCanvasRegionTransparent({
      clientX: 50,
      clientY: 50,
      gl,
      height: 100,
      left: 0,
      radius: 5,
      threshold: 10,
      top: 0,
      width: 100,
    })

    expect(result).toBe(true)
  })

  it('uses only the exact cursor pixel when the radius is zero', () => {
    const gl = createGlMock({ hotPixel: { alpha: 255, x: 50, y: 49 } })

    const result = isCanvasRegionTransparent({
      clientX: 50,
      clientY: 50,
      gl,
      height: 100,
      left: 0,
      radius: 0,
      threshold: 10,
      top: 0,
      width: 100,
    })

    expect(result).toBe(false)
  })
})
