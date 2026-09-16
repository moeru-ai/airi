import { describe, expect, it } from 'vitest'

import { createOutputFilter, defaultOutputFilterOptions } from './filter'
import { neutralPose } from './pose'

function pose(overrides: Partial<typeof neutralPose> = {}) {
  return { ...neutralPose, ...overrides }
}

describe('output filter', () => {
  it('uses the tuned generator cutoff by default', () => {
    expect(defaultOutputFilterOptions).toEqual({
      enabled: true,
      smoothing: 0.8,
      cutoff: 0.0575,
    })
  })

  it('holds cumulative changes below the cutoff', () => {
    const filter = createOutputFilter({ enabled: true, smoothing: 0, cutoff: 0.05 })

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
    const filter = createOutputFilter({ enabled: true, smoothing: 0.75, cutoff: 0 })

    filter.process(pose())
    const firstStep = filter.process(pose({ headX: 1 }))
    const secondStep = filter.process(pose({ headX: 1 }))

    expect(firstStep.pose.headX).toBeCloseTo(0.25)
    expect(secondStep.pose.headX).toBeCloseTo(0.4375)
    expect(firstStep.outputChangeMeanAbsolute).toBeLessThan(firstStep.inputChangeMeanAbsolute)
  })

  it('bypasses the filter when disabled', () => {
    const filter = createOutputFilter({ enabled: false, smoothing: 0.99, cutoff: 1 })

    filter.process(pose())
    const frame = filter.process(pose({ headX: 0.4, mouthOpen: 0.7 }))

    expect(frame.pose).toEqual(frame.inputPose)
    expect(frame.pose.headX).toBe(0.4)
    expect(frame.pose.mouthOpen).toBe(0.7)
  })

  it('passes the first pose through after reset', () => {
    const filter = createOutputFilter(defaultOutputFilterOptions)

    filter.process(pose())
    filter.process(pose({ headX: 1 }))
    filter.reset()
    const restarted = filter.process(pose({ headX: -0.5 }))

    expect(restarted.pose.headX).toBe(-0.5)
    expect(restarted.inputChangeMeanAbsolute).toBe(0)
    expect(restarted.outputChangeMeanAbsolute).toBe(0)
  })

  it('resets stale history when the enabled state changes', () => {
    const filter = createOutputFilter({ enabled: true, smoothing: 0.9, cutoff: 0 })

    filter.process(pose())
    filter.process(pose({ headX: 1 }))
    filter.setOptions({ enabled: false, smoothing: 0.9, cutoff: 0 })
    const bypassed = filter.process(pose({ headX: -0.75 }))

    expect(bypassed.pose.headX).toBe(-0.75)
  })
})
