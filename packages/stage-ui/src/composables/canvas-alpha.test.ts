import { describe, expect, it } from 'vitest'

import { isCanvasRegionTransparent } from './canvas-alpha'

interface GlMockOptions {
  hotPixel?: { x: number, y: number, alpha?: number }
  width?: number
  height?: number
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
    drawingBufferWidth,
    drawingBufferHeight,
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

      const { x, y, alpha = 255 } = hotPixel
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
      gl,
      clientX: 150,
      clientY: 150,
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      radius: 10,
      threshold: 10,
    })

    expect(result).toBe(true)
  })

  it('returns false when an opaque pixel is inside the circular region', () => {
    const gl = createGlMock({ hotPixel: { x: 50, y: 49, alpha: 255 } })

    const result = isCanvasRegionTransparent({
      gl,
      clientX: 50,
      clientY: 50,
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      radius: 10,
      threshold: 10,
    })

    expect(result).toBe(false)
  })

  it('ignores opaque pixels outside the circular region but inside read bounds', () => {
    const gl = createGlMock({ hotPixel: { x: 80, y: 80, alpha: 255 } })

    const result = isCanvasRegionTransparent({
      gl,
      clientX: 50,
      clientY: 50,
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      radius: 5,
      threshold: 10,
    })

    expect(result).toBe(true)
  })
})
