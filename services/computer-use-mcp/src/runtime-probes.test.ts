import type { ComputerUseConfig } from './types'
import type { MultiDisplaySnapshot } from './display'

import { describe, expect, it } from 'vitest'

import { buildCoordinateSpaceInfo, buildDisplayInfoFromSnapshot } from './runtime-probes'
import { createTestConfig } from './test-fixtures'

const baseConfig: ComputerUseConfig = createTestConfig({
  allowedBounds: { x: 0, y: 0, width: 1440, height: 900 },
})

function createMultiDisplaySnapshot(): MultiDisplaySnapshot {
  return {
    displays: [
      {
        displayId: 1,
        isMain: true,
        isBuiltIn: true,
        bounds: { x: 0, y: 0, width: 1512, height: 982 },
        visibleBounds: { x: 0, y: 65, width: 1512, height: 884 },
        scaleFactor: 2,
        pixelWidth: 3024,
        pixelHeight: 1964,
      },
      {
        displayId: 3,
        isMain: false,
        isBuiltIn: false,
        bounds: { x: -222, y: -1080, width: 1920, height: 1080 },
        visibleBounds: { x: -222, y: -1080, width: 1920, height: 1080 },
        scaleFactor: 1,
        pixelWidth: 1920,
        pixelHeight: 1080,
      },
    ],
    combinedBounds: { x: -222, y: -1080, width: 1920, height: 2062 },
    capturedAt: '2026-04-27T00:00:00.000Z',
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
        path: '/tmp/screenshot.png',
        width: 1440,
        height: 900,
        placeholder: false,
      },
    })

    expect(info.readyForMutations).toBe(true)
    expect(info.aligned).toBe(true)
  })

  it('flags logical-vs-physical mismatch on Retina displays', () => {
    const info = buildCoordinateSpaceInfo({
      config: baseConfig,
      lastScreenshot: {
        path: '/tmp/screenshot.png',
        width: 2880,
        height: 1800,
        placeholder: false,
      },
      displayInfo: {
        available: true,
        platform: 'darwin',
        logicalWidth: 1440,
        logicalHeight: 900,
        pixelWidth: 2880,
        pixelHeight: 1800,
        scaleFactor: 2,
        isRetina: true,
      },
    })

    expect(info.readyForMutations).toBe(false)
    expect(info.aligned).toBe(false)
    expect(info.reason).toContain('Retina')
  })

  it('keeps allowed bounds valid when they sit inside combined multi-display bounds', () => {
    const info = buildCoordinateSpaceInfo({
      config: createTestConfig({
        allowedBounds: { x: -222, y: -1080, width: 1920, height: 2062 },
      }),
      lastScreenshot: {
        path: '/tmp/screenshot.png',
        width: 1920,
        height: 2062,
        placeholder: false,
      },
      displayInfo: buildDisplayInfoFromSnapshot(createMultiDisplaySnapshot(), 'darwin'),
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
    expect(info.displays?.[1]?.bounds).toEqual({ x: -222, y: -1080, width: 1920, height: 1080 })
    expect(info.combinedBounds).toEqual({ x: -222, y: -1080, width: 1920, height: 2062 })
  })
})
