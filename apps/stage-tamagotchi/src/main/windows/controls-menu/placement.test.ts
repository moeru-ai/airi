import type { Rectangle } from 'electron'

import { describe, expect, it } from 'vitest'

import { placeControlsMenu } from './placement'

describe('placeControlsMenu', () => {
  it('covers the work area of the display under the more button', () => {
    // A 1728x1117 display with a 33px menu bar and a 57px Dock. The main window sits at the bottom right.
    const workArea = { x: 0, y: 33, width: 1728, height: 1027 }
    const asked: Rectangle[] = []

    const placement = placeControlsMenu({
      content: { x: 1304, y: 738, width: 332, height: 309 },
      anchor: { x: 286, y: 257, width: 36, height: 36 },
      mainZoom: 1,
      menuZoom: 1,
      workAreaOf: (rectangle) => {
        asked.push(rectangle)
        return workArea
      },
    })

    expect(asked).toEqual([{ x: 1590, y: 995, width: 36, height: 36 }])
    expect(placement.bounds).toEqual(workArea)
    expect(placement.anchor).toEqual({ x: 1590, y: 962, width: 36, height: 36 })
  })

  it('rounds a button on a fractional position to whole DIPs before the display match', () => {
    const asked: Rectangle[] = []

    placeControlsMenu({
      content: { x: 100, y: 200, width: 332, height: 309 },
      anchor: { x: 286.4, y: 257.6, width: 36.2, height: 35.8 },
      mainZoom: 1,
      menuZoom: 1,
      workAreaOf: (rectangle) => {
        asked.push(rectangle)
        return { x: 0, y: 0, width: 1920, height: 1080 }
      },
    })

    expect(asked).toEqual([{ x: 386, y: 458, width: 36, height: 36 }])
  })

  it('places the button in the page of a window on a display left of the primary one', () => {
    const workArea = { x: -2560, y: -200, width: 2560, height: 1415 }

    const placement = placeControlsMenu({
      content: { x: -600, y: 700, width: 332, height: 309 },
      anchor: { x: 286, y: 257, width: 36, height: 36 },
      mainZoom: 1,
      menuZoom: 1,
      workAreaOf: () => workArea,
    })

    expect(placement.bounds).toEqual(workArea)
    expect(placement.anchor).toEqual({ x: 2246, y: 1157, width: 36, height: 36 })
  })

  it('measures the button through the zoom of each page', () => {
    // View > Zoom In makes one CSS pixel 1.25 DIPs in both pages.
    const asked: Rectangle[] = []

    const placement = placeControlsMenu({
      content: { x: 100, y: 200, width: 332, height: 309 },
      anchor: { x: 200, y: 100, width: 36, height: 36 },
      mainZoom: 1.25,
      menuZoom: 1.25,
      workAreaOf: (rectangle) => {
        asked.push(rectangle)
        return { x: 0, y: 0, width: 1920, height: 1080 }
      },
    })

    expect(asked).toEqual([{ x: 350, y: 325, width: 45, height: 45 }])
    expect(placement.anchor).toEqual({ x: 280, y: 260, width: 36, height: 36 })
  })
})
