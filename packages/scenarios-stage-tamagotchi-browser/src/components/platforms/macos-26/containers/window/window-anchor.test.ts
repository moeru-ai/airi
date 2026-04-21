import { describe, expect, it } from 'vitest'

import { computeElementAnchorStyle, createContainerAnchorStyle, createWorkAreaRect, normalizeRectForScale } from './window-anchor'

describe('createContainerAnchorStyle', () => {
  it('anchors a window to the platform top-right corner', () => {
    expect(createContainerAnchorStyle('top-right')).toEqual({
      right: '0px',
      top: '0px',
    })
  })

  it('centers a window in the platform', () => {
    expect(createContainerAnchorStyle('center')).toEqual({
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    })
  })

  it('anchors a window to the usable area left of a vertical dock', () => {
    expect(createContainerAnchorStyle('bottom-right', {
      left: 0,
      top: 0,
      width: 1720,
      height: 1080,
    }, {
      width: 1920,
      height: 1080,
    })).toEqual({
      bottom: '0px',
      right: '200px',
    })
  })
})

describe('createWorkAreaRect', () => {
  it('shrinks the work area from the right edge for a vertical dock', () => {
    expect(createWorkAreaRect({
      platformRect: {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
      },
      dockRect: {
        left: 1720,
        top: 240,
        width: 160,
        height: 600,
      },
    })).toEqual({
      left: 0,
      top: 0,
      width: 1720,
      height: 1080,
    })
  })
})

describe('computeElementAnchorStyle', () => {
  it('anchors the same window corner to an element corner inside the platform', () => {
    expect(computeElementAnchorStyle({
      anchor: 'bottom-right',
      anchorRect: {
        left: 210,
        top: 140,
        width: 120,
        height: 40,
      },
      platformRect: {
        left: 100,
        top: 50,
      },
      windowRect: {
        width: 80,
        height: 30,
      },
    })).toEqual({
      left: '150px',
      top: '100px',
    })
  })
})

describe('normalizeRectForScale', () => {
  it('converts measured rect values into logical coordinates for scaled platform UI', () => {
    expect(normalizeRectForScale({
      left: 960,
      top: 240,
      width: 640,
      height: 360,
    }, 2)).toEqual({
      left: 480,
      top: 120,
      width: 320,
      height: 180,
    })
  })
})
