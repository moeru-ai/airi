import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { describe, expect, it } from 'vitest'

import {
  createLive2DMotionOutputFilter,
  defaultLive2DMotionOutputFilterOptions,
} from './live2d-motion-output-filter-prototype'

function pose(overrides: Partial<typeof neutralLive2DMotionControlPose> = {}) {
  return { ...neutralLive2DMotionControlPose, ...overrides }
}

describe('live2DMotionOutputFilterPrototype', () => {
  it('holds cumulative changes below the cutoff', () => {
    const filter = createLive2DMotionOutputFilter({ enabled: true, smoothing: 0, cutoff: 0.05 })

    filter.process(pose())
    const firstNoise = filter.process(pose({ headX: 0.01 }))
    const accumulatedNoise = filter.process(pose({ headX: 0.04 }))
    const acceptedChange = filter.process(pose({ headX: 0.06 }))

    expect(firstNoise.pose.headX).toBe(0)
    expect(firstNoise.cutoffTrackCount).toBe(1)
    expect(accumulatedNoise.pose.headX).toBe(0)
    expect(acceptedChange.pose.headX).toBe(0.06)
    expect(acceptedChange.cutoffTrackCount).toBe(0)
  })

  it('applies EMA smoothing after the cutoff stage', () => {
    const filter = createLive2DMotionOutputFilter({ enabled: true, smoothing: 0.75, cutoff: 0 })

    filter.process(pose())
    const firstStep = filter.process(pose({ headX: 1 }))
    const secondStep = filter.process(pose({ headX: 1 }))

    expect(firstStep.pose.headX).toBeCloseTo(0.25)
    expect(secondStep.pose.headX).toBeCloseTo(0.4375)
    expect(firstStep.outputChangeMeanAbsolute).toBeLessThan(firstStep.inputChangeMeanAbsolute)
  })

  it('bypasses the filter when disabled', () => {
    const filter = createLive2DMotionOutputFilter({ enabled: false, smoothing: 0.99, cutoff: 1 })

    filter.process(pose())
    const frame = filter.process(pose({ headX: 0.4, mouthOpen: 0.7 }))

    expect(frame.pose).toEqual(frame.inputPose)
    expect(frame.pose.headX).toBe(0.4)
    expect(frame.pose.mouthOpen).toBe(0.7)
  })

  it('passes the first pose through after reset', () => {
    const filter = createLive2DMotionOutputFilter(defaultLive2DMotionOutputFilterOptions)

    filter.process(pose())
    filter.process(pose({ headX: 1 }))
    filter.reset()
    const restarted = filter.process(pose({ headX: -0.5 }))

    expect(restarted.pose.headX).toBe(-0.5)
    expect(restarted.inputChangeMeanAbsolute).toBe(0)
    expect(restarted.outputChangeMeanAbsolute).toBe(0)
  })

  it('resets stale history when the enabled state changes', () => {
    const filter = createLive2DMotionOutputFilter({ enabled: true, smoothing: 0.9, cutoff: 0 })

    filter.process(pose())
    filter.process(pose({ headX: 1 }))
    filter.setOptions({ enabled: false, smoothing: 0.9, cutoff: 0 })
    const bypassed = filter.process(pose({ headX: -0.75 }))

    expect(bypassed.pose.headX).toBe(-0.75)
  })
})
