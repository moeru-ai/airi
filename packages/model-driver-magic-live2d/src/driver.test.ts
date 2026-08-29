import type { Generator } from '@proj-airi/motion-driver-magic'

import type { Pose } from './pose'

import { describe, expect, it, vi } from 'vitest'

import { createDriver } from './driver'
import { neutralPose, valuesFromPose } from './pose'

function createGenerator(overrides: Partial<Pose> = {}): Generator<number> {
  let state = 0
  return {
    sampleRateHz: 30,
    next: vi.fn(() => {
      state++
      return {
        values: valuesFromPose({ ...neutralPose, headX: state / 10, ...overrides }),
        state,
      }
    }),
  }
}

describe('driver', () => {
  it('applies the first pose and only publishes the newest catch-up frame', () => {
    const apply = vi.fn()
    const onGenerate = vi.fn()
    const callbacks: FrameRequestCallback[] = []
    const generator = createGenerator()
    const driver = createDriver({
      target: { apply, release: vi.fn() },
      filterOptions: { enabled: false, smoothing: 0, cutoff: 0 },
      now: () => 0,
      requestFrame: (callback) => {
        callbacks.push(callback)
        return callbacks.length
      },
      cancelFrame: vi.fn(),
      onGenerate,
    })

    driver.start(generator)
    callbacks[0](101)

    expect(generator.next).toHaveBeenCalledTimes(4)
    expect(onGenerate).toHaveBeenCalledTimes(4)
    expect(apply).toHaveBeenCalledTimes(2)
    expect(apply.mock.calls[0][0].headX).toBe(0.1)
    expect(apply.mock.calls[1][0].headX).toBe(0.4)
  })

  it('filters the newest catch-up pose once per display update', () => {
    const apply = vi.fn()
    const callbacks: FrameRequestCallback[] = []
    const driver = createDriver({
      target: { apply, release: vi.fn() },
      filterOptions: { enabled: true, smoothing: 0.5, cutoff: 0 },
      now: () => 0,
      requestFrame: (callback) => {
        callbacks.push(callback)
        return callbacks.length
      },
      cancelFrame: vi.fn(),
    })

    driver.start(createGenerator())
    callbacks[0](101)

    expect(apply).toHaveBeenCalledTimes(2)
    expect(apply.mock.calls[0][0].headX).toBe(0.1)
    expect(apply.mock.calls[1][0].headX).toBeCloseTo(0.25)
  })

  it('skips generated mouth opening by default', () => {
    const apply = vi.fn()
    const driver = createDriver({
      target: { apply, release: vi.fn() },
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    })

    driver.start(createGenerator({ mouthOpen: 0.7 }))

    expect(apply).toHaveBeenCalledOnce()
    expect(apply.mock.calls[0][0].mouthOpen).toBe(0)
  })

  it('publishes generated mouth opening when the output is enabled', () => {
    const apply = vi.fn()
    const driver = createDriver({
      target: { apply, release: vi.fn() },
      skipMouthOpen: () => false,
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    })

    driver.start(createGenerator({ mouthOpen: 0.7 }))

    expect(apply).toHaveBeenCalledOnce()
    expect(apply.mock.calls[0][0].mouthOpen).toBe(0.7)
  })

  it('replaces the generator without releasing the target', () => {
    const release = vi.fn()
    const cancelFrame = vi.fn()
    const callbacks: FrameRequestCallback[] = []
    const driver = createDriver({
      target: { apply: vi.fn(), release },
      now: () => 0,
      requestFrame: (callback) => {
        callbacks.push(callback)
        return callbacks.length
      },
      cancelFrame,
    })

    driver.start(createGenerator())
    driver.replace(createGenerator())

    expect(driver.playing).toBe(true)
    expect(release).not.toHaveBeenCalled()

    driver.stop()

    expect(driver.playing).toBe(false)
    expect(cancelFrame).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
  })
})
