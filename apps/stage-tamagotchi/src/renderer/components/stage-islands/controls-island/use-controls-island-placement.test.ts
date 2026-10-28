import type { Rectangle } from 'electron'

import { describe, expect, it } from 'vitest'

import { resolveControlsIslandDock } from './use-controls-island-placement'

const primaryDisplay = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 25, width: 1920, height: 1055 },
}

function resolve(windowBounds: Rectangle, previousDock: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'bottom-right') {
  return resolveControlsIslandDock({
    displays: [primaryDisplay],
    previousDock,
    windowBounds,
  })
}

describe('resolveControlsIslandDock', () => {
  it('docks at the top-left screen corner', () => {
    expect(resolve({ x: 100, y: 100, width: 450, height: 600 })).toBe('top-left')
  })

  it('docks at the top-right screen corner', () => {
    expect(resolve({ x: 1370, y: 100, width: 450, height: 600 })).toBe('top-right')
  })

  it('docks at the bottom-left screen corner', () => {
    expect(resolve({ x: 100, y: 430, width: 450, height: 600 })).toBe('bottom-left')
  })

  it('docks at the bottom-right screen corner', () => {
    expect(resolve({ x: 1370, y: 430, width: 450, height: 600 })).toBe('bottom-right')
  })

  it('keeps the previous dock inside the display center dead zone', () => {
    expect(resolve({ x: 735, y: 253, width: 450, height: 600 }, 'top-left')).toBe('top-left')
  })

  it('keeps the current dock until display data is available', () => {
    expect(resolveControlsIslandDock({
      displays: [],
      previousDock: 'top-right',
      windowBounds: { x: 100, y: 100, width: 450, height: 600 },
    })).toBe('top-right')
  })

  it('keeps the default dock until window bounds are available', () => {
    expect(resolve({ x: 0, y: 0, width: 0, height: 0 })).toBe('bottom-right')
  })

  it('docks left when the window sits against the right work-area edge', () => {
    expect(resolve({ x: 1470, y: 100, width: 450, height: 600 })).toBe('top-left')
  })

  it('docks left when the window overhangs the right work-area edge', () => {
    expect(resolve({ x: 1700, y: 100, width: 450, height: 600 })).toBe('top-left')
  })

  it('docks right when the window sits against the left work-area edge', () => {
    expect(resolve({ x: 0, y: 100, width: 450, height: 600 })).toBe('top-right')
  })

  it('docks top when the window overhangs the bottom work-area edge', () => {
    expect(resolve({ x: 1370, y: 900, width: 450, height: 600 })).toBe('top-right')
  })

  it('uses the display that contains the largest window area and flips off overhanging edges', () => {
    const secondaryDisplay = {
      bounds: { x: -1600, y: -900, width: 1600, height: 900 },
      workArea: { x: -1600, y: -900, width: 1600, height: 860 },
    }

    expect(resolveControlsIslandDock({
      displays: [primaryDisplay, secondaryDisplay],
      previousDock: 'bottom-right',
      windowBounds: { x: -500, y: -300, width: 450, height: 600 },
    })).toBe('top-right')
  })
})
