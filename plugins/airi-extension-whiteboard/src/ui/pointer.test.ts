import { describe, expect, it } from 'vitest'

import { pointFromPointerEvent } from './pointer'

describe('pointFromPointerEvent', () => {
  // https://github.com/moeru-ai/airi/pull/2441#discussion_r3912253477
  // ROOT CAUSE:
  //
  // The old calculation scaled against the full SVG bounding rectangle.
  // SVG letterboxed the viewBox when its aspect ratio differed from the canvas.
  // A pointer on the visible canvas edge therefore received the wrong y value.
  //
  // We fixed this by transforming client coordinates through the SVG screen
  // matrix, which includes the viewBox scale and its letterbox offset.
  it('maps a pointer at the letterboxed canvas edge to the viewBox edge', () => {
    const svg = {
      getScreenCTM: () => ({
        inverse: () => ({
          a: 1200 / 390,
          b: 0,
          c: 0,
          d: 800 / 260,
          e: 0,
          f: -292 * 800 / 260,
        }),
      }),
    }

    const point = pointFromPointerEvent(
      { clientX: 195, clientY: 292 },
      svg,
    )

    expect(point?.x).toBeCloseTo(600)
    expect(point?.y).toBeCloseTo(0)
  })
})
