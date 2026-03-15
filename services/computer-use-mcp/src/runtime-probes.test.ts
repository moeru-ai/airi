import type { ComputerUseConfig } from './types'

import { describe, expect, it } from 'vitest'

import { buildCoordinateSpaceInfo } from './runtime-probes'
import { createTestConfig } from './test-fixtures'

const baseConfig: ComputerUseConfig = createTestConfig({
  allowedBounds: { x: 0, y: 0, width: 1440, height: 900 },
})

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
})
