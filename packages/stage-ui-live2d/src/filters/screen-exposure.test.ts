import { ambientLightDefaults, ambientLightNeutralEnvironment, createAmbientLightMap } from '@proj-airi/stage-shared/screen-ambient-light'
import { describe, expect, it } from 'vitest'

import { ScreenExposure } from './screen-exposure'

const options = { ...ambientLightDefaults.exposure, enabled: true }
function environment(level: number) {
  return { ...ambientLightNeutralEnvironment, surround: createAmbientLightMap([level, level, level]) }
}
function advance(meter: ScreenExposure, from: number, to: number, step = 100) {
  for (let now = from + step; now <= to; now += step) meter.advance(now)
}

describe('screen exposure', () => {
  it('recovers bloom sensitivity slowly after a bright screen becomes dark', () => {
    const meter = new ScreenExposure()
    meter.configure(environment(1), options, true, 0)
    const bright = meter.bloomGain
    meter.configure(environment(0.01), options, true, 0)
    expect(meter.bloomGain).toBe(bright)
    advance(meter, 0, 3000)
    const afterThreeSeconds = meter.bloomGain
    advance(meter, 3000, 18000)
    expect(bright).toBeLessThan(0.3)
    expect(afterThreeSeconds).toBeGreaterThan(bright)
    expect(meter.bloomGain).toBeGreaterThan(afterThreeSeconds)
    expect(meter.bloomGain).toBeLessThanOrEqual(2)
  })

  it('settles faster after a dark screen becomes bright', () => {
    const meter = new ScreenExposure()
    meter.configure(environment(0.01), options, true, 0)
    const dark = meter.bloomGain
    meter.configure(environment(1), options, true, 0)
    expect(meter.bloomGain).toBe(dark)
    advance(meter, 0, 6000)
    expect(meter.bloomGain).toBeLessThan(0.31)
  })

  it('is independent of render cadence and continues without new samples', () => {
    const fast = new ScreenExposure()
    const slow = new ScreenExposure()
    for (const meter of [fast, slow]) {
      meter.configure(environment(1), options, true, 0)
      meter.configure(environment(0.01), options, true, 0)
    }
    advance(fast, 0, 6000, 20)
    advance(slow, 0, 6000, 1000)
    expect(fast.bloomGain).toBeCloseTo(slow.bloomGain, 10)
  })

  it('keeps exposure separate from adaptation and doubles light per stop', () => {
    const meter = new ScreenExposure()
    meter.configure(environment(1), { ...options, screenNits: 400, compensation: 1 }, true, 0)
    expect(meter.lightScale).toBe(2)
    expect(meter.cameraExposure).toBe(2)
    meter.configure(environment(0.01), { ...options, screenNits: 400, compensation: 1 }, true, 0)
    advance(meter, 0, 6000)
    expect(meter.cameraExposure).toBe(2)
  })

  it('resets on disable and seeds current light on re-enable', () => {
    const meter = new ScreenExposure()
    meter.configure(environment(0.01), options, true, 0)
    meter.configure(environment(1), options, false, 100)
    expect(meter.bloomGain).toBe(1)
    expect(meter.lightScale).toBe(1)
    meter.configure(environment(1), options, true, 1000)
    expect(meter.bloomGain).toBeLessThan(0.3)
    meter.configure(environment(0), { ...options, adaptiveBloom: false }, true, 1000)
    advance(meter, 1000, 7000)
    expect(meter.bloomGain).toBe(1)
  })

  it('does not replay adaptation after a suspended renderer resumes', () => {
    const meter = new ScreenExposure()
    meter.configure(environment(1), options, true, 0)
    meter.configure(environment(0.01), options, true, 0)
    meter.advance(30000)
    const fresh = new ScreenExposure()
    fresh.configure(environment(0.01), options, true, 30000)
    expect(meter.bloomGain).toBe(fresh.bloomGain)
    meter.configure(environment(1), options, true, 60000)
    expect(meter.bloomGain).toBeLessThan(0.3)
  })
})
