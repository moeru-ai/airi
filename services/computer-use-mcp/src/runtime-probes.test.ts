import type { MultiDisplaySnapshot } from './display'
import type { ComputerUseConfig } from './types'

import { describe, expect, it } from 'vitest'

import { buildCoordinateSpaceInfo, buildDisplayInfoFromSnapshot } from './runtime-probes'
import { createTestConfig } from './test-fixtures'

const baseConfig: ComputerUseConfig = createTestConfig({
  allowedBounds: { height: 900, width: 1440, x: 0, y: 0 },
})

function createMultiDisplaySnapshot(): MultiDisplaySnapshot {
  return {
    capturedAt: '2026-04-27T00:00:00.000Z',
    combinedBounds: { height: 2062, width: 1920, x: -222, y: -1080 },
    displays: [
      {
        bounds: { height: 982, width: 1512, x: 0, y: 0 },
        displayId: 1,
        isBuiltIn: true,
        isMain: true,
        pixelHeight: 1964,
        pixelWidth: 3024,
        scaleFactor: 2,
        visibleBounds: { height: 884, width: 1512, x: 0, y: 65 },
      },
      {
        bounds: { height: 1080, width: 1920, x: -222, y: -1080 },
        displayId: 3,
        isBuiltIn: false,
        isMain: false,
        pixelHeight: 1080,
        pixelWidth: 1920,
        scaleFactor: 1,
        visibleBounds: { height: 1080, width: 1920, x: -222, y: -1080 },
      },
    ],
  }
}

describe('buildCoordinateSpaceInfo', () => {
  it('requires a screenshot before real input', () => {
    const info = buildCoordinateSpaceInfo({
      config: baseConfig,
    })

    expect(info.readyForMutations).toBe(false)
    expect(info.reason).toContain('capture a screenshot')
  })

  it('accepts matching bounds and screenshot dimensions', () => {
    const info = buildCoordinateSpaceInfo({
      config: baseConfig,
      lastScreenshot: {
        height: 900,
        path: '/tmp/screenshot.png',
        placeholder: false,
        width: 1440,
      },
    })

    expect(info.readyForMutations).toBe(true)
    expect(info.aligned).toBe(true)
  })

  it('flags logical-vs-physical mismatch on Retina displays', () => {
    const info = buildCoordinateSpaceInfo({
      config: baseConfig,
      displayInfo: {
        available: true,
        isRetina: true,
        logicalHeight: 900,
        logicalWidth: 1440,
        pixelHeight: 1800,
        pixelWidth: 2880,
        platform: 'darwin',
        scaleFactor: 2,
      },
      lastScreenshot: {
        height: 1800,
        path: '/tmp/screenshot.png',
        placeholder: false,
        width: 2880,
      },
    })

    expect(info.readyForMutations).toBe(false)
    expect(info.aligned).toBe(false)
    expect(info.reason).toContain('Retina')
  })

  it('keeps allowed bounds valid when they sit inside combined multi-display bounds', () => {
    const info = buildCoordinateSpaceInfo({
      config: createTestConfig({
        allowedBounds: { height: 2062, width: 1920, x: -222, y: -1080 },
      }),
      displayInfo: buildDisplayInfoFromSnapshot(createMultiDisplaySnapshot(), 'darwin'),
      lastScreenshot: {
        height: 2062,
        path: '/tmp/screenshot.png',
        placeholder: false,
        width: 1920,
      },
    })

    expect(info.readyForMutations).toBe(true)
    expect(info.aligned).toBe(true)
  })
})

describe('buildDisplayInfoFromSnapshot', () => {
  it('preserves legacy main-display facts while exposing multi-display bounds', () => {
    const info = buildDisplayInfoFromSnapshot(createMultiDisplaySnapshot(), 'darwin')

    expect(info.available).toBe(true)
    expect(info.logicalWidth).toBe(1512)
    expect(info.logicalHeight).toBe(982)
    expect(info.pixelWidth).toBe(3024)
    expect(info.pixelHeight).toBe(1964)
    expect(info.scaleFactor).toBe(2)
    expect(info.isRetina).toBe(true)
    expect(info.displayCount).toBe(2)
    expect(info.displays?.[1]?.bounds).toEqual({ height: 1080, width: 1920, x: -222, y: -1080 })
    expect(info.combinedBounds).toEqual({ height: 2062, width: 1920, x: -222, y: -1080 })
  })
})
