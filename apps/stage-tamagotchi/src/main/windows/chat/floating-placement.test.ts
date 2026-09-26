import { describe, expect, it } from 'vitest'

import { attachedChatOffset, chooseAttachedChatLayout, keepChatOnDisplay, preferredAttachedChatLayout, wholePixels } from './floating-placement'

const workArea = { x: 0, y: 25, width: 1920, height: 1055 }
const chatSize = { width: 360, height: 520 }

describe('chooseAttachedChatLayout', () => {
  it('moves the chat to the right side when the left side of the work area is too narrow', () => {
    const layout = chooseAttachedChatLayout({ x: 100, y: 300, width: 450, height: 600 }, chatSize, workArea, preferredAttachedChatLayout)

    expect(layout.side).toBe('right')
  })

  it('stays on the right side until the left side has room to spare', () => {
    const current = { side: 'right', anchor: 'bottom' } as const
    const justFits = chooseAttachedChatLayout({ x: 370, y: 300, width: 450, height: 600 }, chatSize, workArea, current)
    const roomToSpare = chooseAttachedChatLayout({ x: 400, y: 300, width: 450, height: 600 }, chatSize, workArea, current)

    expect(justFits.side).toBe('right')
    expect(roomToSpare.side).toBe('left')
  })

  it('lines the chat up with the top of a main window near the top of the work area', () => {
    const layout = chooseAttachedChatLayout({ x: 1000, y: 25, width: 450, height: 300 }, chatSize, workArea, preferredAttachedChatLayout)

    expect(layout.anchor).toBe('top')
  })

  it('stays top anchored until the bottom anchor has room to spare', () => {
    const current = { side: 'left', anchor: 'top' } as const
    const justFits = chooseAttachedChatLayout({ x: 1000, y: 250, width: 450, height: 300 }, chatSize, workArea, current)
    const roomToSpare = chooseAttachedChatLayout({ x: 1000, y: 280, width: 450, height: 300 }, chatSize, workArea, current)

    expect(justFits.anchor).toBe('top')
    expect(roomToSpare.anchor).toBe('bottom')
  })

  it('goes back to the left side when neither side has room to spare', () => {
    const wide = { x: 100, y: 300, width: 1500, height: 600 }
    const leftJustFits = { x: 380, y: 300, width: 1300, height: 600 }

    expect(chooseAttachedChatLayout(wide, chatSize, workArea, preferredAttachedChatLayout).side).toBe('left')
    expect(chooseAttachedChatLayout(leftJustFits, chatSize, workArea, { side: 'right', anchor: 'bottom' }).side).toBe('left')
  })

  it('lines the chat up with the top of a main window on a display below the first', () => {
    const lowerWorkArea = { x: 0, y: 1080, width: 1920, height: 1055 }
    const layout = chooseAttachedChatLayout({ x: 1000, y: 1080, width: 450, height: 300 }, chatSize, lowerWorkArea, preferredAttachedChatLayout)

    expect(layout.anchor).toBe('top')
  })
})

describe('attachedChatOffset', () => {
  it('puts a left, bottom anchored chat against the main window edge, sharing its bottom edge', () => {
    const offset = attachedChatOffset({ x: 1000, y: 300, width: 450, height: 600 }, chatSize, workArea, preferredAttachedChatLayout)

    expect(offset).toEqual({ x: -360, y: 80 })
  })

  it('puts a right, top anchored chat against the right edge, sharing the top edge', () => {
    const offset = attachedChatOffset({ x: 100, y: 25, width: 450, height: 300 }, chatSize, workArea, { side: 'right', anchor: 'top' })

    expect(offset).toEqual({ x: 450, y: 0 })
  })

  it('keeps a chat without room beside the main window inside the work area', () => {
    const offset = attachedChatOffset({ x: 100, y: 25, width: 450, height: 300 }, chatSize, workArea, preferredAttachedChatLayout)

    expect(offset).toEqual({ x: -100, y: 0 })
  })
})

describe('keepChatOnDisplay', () => {
  // A 1920x1080 primary display with a menu bar, and a 1280x800 display on its left.
  const primary = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea }
  const leftDisplay = { bounds: { x: -1280, y: 0, width: 1280, height: 800 }, workArea: { x: -1280, y: 0, width: 1280, height: 800 } }
  const displays = [primary, leftDisplay]

  it('keeps the top edge, where the grip and the drag handle sit, below the menu bar', () => {
    const bounds = keepChatOnDisplay({ x: 600, y: -200, width: 380, height: 560 }, displays)

    expect(bounds).toEqual({ x: 600, y: 25, width: 380, height: 560 })
  })

  it('stops a chat dragged past the right edge of the last display', () => {
    const bounds = keepChatOnDisplay({ x: 1800, y: 300, width: 380, height: 560 }, displays)

    expect(bounds).toEqual({ x: 1540, y: 300, width: 380, height: 560 })
  })

  it('moves a chat onto the display that would hold most of it', () => {
    const bounds = keepChatOnDisplay({ x: -300, y: 600, width: 380, height: 560 }, displays)

    // Most of the chat is on the left display, at negative coordinates, and
    // it fits inside that display's shorter work area.
    expect(bounds).toEqual({ x: -380, y: 240, width: 380, height: 560 })
  })

  it('shrinks a chat saved on a larger display instead of pushing its top-left corner off screen', () => {
    // ROOT CAUSE:
    //
    // The clamp kept the size, so a chat taller than the work area got a top
    // edge above it, with the grip and the drag handle out of reach.
    //
    // The clamp now fits the size to the work area first.
    const bounds = keepChatOnDisplay({ x: -1280, y: 0, width: 1400, height: 1000 }, displays)

    expect(bounds).toEqual({ x: -1280, y: 0, width: 1280, height: 800 })
  })
})

describe('wholePixels', () => {
  it('gives setPosition and setBounds whole pixels without negative zero', () => {
    // ROOT CAUSE:
    //
    // The attached chat slid to a new anchor with
    // `setPosition(Math.round(x), Math.round(y))`. Near a display edge,
    // `Math.round(-0.3)` is -0, and Electron rejects it as a conversion
    // failure, which crashed the main process on Windows.
    //
    // Window coordinates now go through wholePixels.
    expect(Object.is(wholePixels(-0.3), 0)).toBe(true)
    expect(wholePixels(12.5)).toBe(13)
  })

  it('keeps a dragged chat in whole pixels on a display left of the first', () => {
    const leftDisplay = { bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1920, y: 0, width: 1920, height: 1080 } }

    const kept = keepChatOnDisplay({ x: -380.3, y: 100.6, width: 380, height: 560 }, [leftDisplay])

    expect(kept).toEqual({ x: -380, y: 101, width: 380, height: 560 })

    // A work area that starts left of 0 lets -0 through the clamp.
    const wideDisplay = { bounds: { x: -1920, y: 0, width: 3840, height: 1080 }, workArea: { x: -1920, y: 0, width: 3840, height: 1080 } }
    expect(Object.is(keepChatOnDisplay({ x: -0, y: 100, width: 380, height: 560 }, [wideDisplay]).x, 0)).toBe(true)
  })
})
