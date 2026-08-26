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
      height: 1080,
      left: 0,
      top: 0,
      width: 1720,
    }, {
      height: 1080,
      width: 1920,
    })).toEqual({
      bottom: '0px',
      right: '200px',
    })
  })
})

describe('createWorkAreaRect', () => {
  it('shrinks the work area from the right edge for a vertical dock', () => {
    expect(createWorkAreaRect({
      dockRect: {
        height: 600,
        left: 1720,
        top: 240,
        width: 160,
      },
      platformRect: {
        height: 1080,
        left: 0,
        top: 0,
        width: 1920,
      },
    })).toEqual({
      height: 1080,
      left: 0,
      top: 0,
      width: 1720,
    })
  })
})

describe('computeElementAnchorStyle', () => {
  it('anchors the same window corner to an element corner inside the platform', () => {
    expect(computeElementAnchorStyle({
      anchor: 'bottom-right',
      anchorRect: {
        height: 40,
        left: 210,
        top: 140,
        width: 120,
      },
      platformRect: {
        left: 100,
        top: 50,
      },
      windowRect: {
        height: 30,
        width: 80,
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
      height: 360,
      left: 960,
      top: 240,
      width: 640,
    }, 2)).toEqual({
      height: 180,
      left: 480,
      top: 120,
      width: 320,
    })
  })
})
