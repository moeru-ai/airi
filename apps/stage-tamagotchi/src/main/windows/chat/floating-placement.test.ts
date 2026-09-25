import { describe, expect, it } from 'vitest'

import {
  attachedChatOffset,
  chooseAttachedChatLayout,
  floatingChatMinimumSize,
  preferredAttachedChatLayout,
  resizeFloatingChatFromGrip,
} from './floating-placement'

const workArea = { x: 0, y: 25, width: 1920, height: 1055 }
const chatSize = { width: 360, height: 520 }

describe('chooseAttachedChatLayout', () => {
  it('keeps the preferred layout while it fits', () => {
    const layout = chooseAttachedChatLayout({ x: 1000, y: 300, width: 450, height: 600 }, chatSize, workArea, preferredAttachedChatLayout)

    expect(layout).toEqual({ side: 'left', anchor: 'bottom' })
  })

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

  it('keeps the chat inside a work area too small for the layout', () => {
    const offset = attachedChatOffset({ x: 0, y: 300, width: 400, height: 600 }, chatSize, { x: 0, y: 0, width: 700, height: 1080 }, preferredAttachedChatLayout)

    expect(offset.x).toBe(0)
  })
})

describe('resizeFloatingChatFromGrip', () => {
  it('grows a left, bottom anchored chat when the grip moves left and up', () => {
    const size = resizeFloatingChatFromGrip(chatSize, { deltaX: -40, deltaY: -20 }, preferredAttachedChatLayout, workArea)

    expect(size).toEqual({ width: 400, height: 540 })
  })

  it('grows a right, top anchored chat when the grip moves right and down', () => {
    const size = resizeFloatingChatFromGrip(chatSize, { deltaX: 40, deltaY: 20 }, { side: 'right', anchor: 'top' }, workArea)

    expect(size).toEqual({ width: 400, height: 540 })
  })

  it('returns whole pixels for fractional pointer movement', () => {
    const size = resizeFloatingChatFromGrip(chatSize, { deltaX: -7.5, deltaY: -7.5 }, preferredAttachedChatLayout, workArea)

    expect(size).toEqual({ width: 368, height: 528 })
  })

  it('stops shrinking at the minimum size', () => {
    const size = resizeFloatingChatFromGrip(chatSize, { deltaX: 500, deltaY: 500 }, preferredAttachedChatLayout, workArea)

    expect(size).toEqual(floatingChatMinimumSize)
  })
})
