import { ambientLightDefaults, ambientLightNeutralEnvironment, createAmbientLightMap } from '@proj-airi/stage-shared/screen-ambient-light'
import { describe, expect, it } from 'vitest'

import { ScreenExposure } from './screen-exposure'

// Fixed photometric inputs keep timing and unit-conversion checks independent
// of the user-tuned default preset.
const options = { ...ambientLightDefaults.exposure, enabled: true, screenNits: 200, compensation: 0, darkSeconds: 6, brightSeconds: 1.5, darkBase: 0.2, brightBase: 0.5, baseCurve: 0.5 }
function environment(level: number) {
  return { ...ambientLightNeutralEnvironment, surround: createAmbientLightMap([level, level, level]) }
}
function advance(meter: ScreenExposure, from: number, to: number, step = 100) {
  for (let now = from + step; now <= to; now += step) meter.advance(now)
}

describe('screen exposure', () => {
  it('drives squint from the same adapting brightness meter as bloom', () => {
    const meter = new ScreenExposure()
    meter.configure(environment(0.01), options, true, 0)
    expect(meter.brightnessRise).toBe(0)
    const darkGain = meter.bloomGain
    meter.configure(environment(1), options, true, 0)
    expect(meter.brightnessRise).toBeCloseTo(0.99)
    expect(meter.bloomGain).toBe(darkGain)
    advance(meter, 0, 1000)
    expect(meter.brightnessRise).toBeLessThan(0.99)
    expect(meter.bloomGain).toBeLessThan(darkGain)
    advance(meter, 1000, 30000)
    expect(meter.brightnessRise).toBeLessThan(0.001)
    meter.configure(environment(0), options, true, 30000)
    expect(meter.brightnessRise).toBe(0)
  })

  it('does not replay brightness rises when adaptation starts or resumes', () => {
    const meter = new ScreenExposure()
    meter.configure(environment(1), options, true, 0)
    expect(meter.brightnessRise).toBe(0)
    meter.configure(environment(0.01), options, true, 0)
    meter.advance(10000)
    meter.configure(environment(1), options, true, 20000)
    expect(meter.brightnessRise).toBe(0)
    meter.configure(environment(0.01), options, true, 20000)
    meter.advance(30000)
    meter.configure(environment(1), { ...options, adaptiveBloom: false }, true, 30000)
    expect(meter.brightnessRise).toBe(0)
    meter.configure(environment(1), options, false, 30000)
    expect(meter.brightnessRise).toBe(0)
  })

  it('maps full-screen mean brightness through a bounded monotonic baseline curve', () => {
    const meter = new ScreenExposure()
    const base = { ...options, adaptiveBase: true, darkBase: 0.2, brightBase: 0.6, baseCurve: 0.5 }
    let previous = 0
    for (const level of [0, 0.01, 0.25, 0.5, 1]) {
      // Local glow remains black; the full-display mean determines the baseline.
      const screen = { radiance: createAmbientLightMap([level, level, level]), stage: { x: 0.8, y: 0.5, width: 0.2, height: 0.5 }, aspect: 1 }
      meter.configure({ ...environment(0), screen }, base, true, 0)
      meter.advance(10000)
      expect(meter.baseBrightness).toBeCloseTo(0.2 + 0.4 * Math.sqrt(level), 6)
      expect(meter.baseBrightness!).toBeGreaterThanOrEqual(previous)
      previous = meter.baseBrightness!
    }
    meter.configure(environment(0.25), { ...base, baseCurve: 1 }, true, 20000)
    expect(meter.baseBrightness).toBeCloseTo(0.3, 6)
    meter.configure(environment(0.25), { ...base, adaptiveBase: false }, true, 20000)
    expect(meter.baseBrightness).toBeUndefined()
  })

  it('smooths the baseline without new samples and leaves direct light independent', () => {
    const meter = new ScreenExposure()
    meter.configure(environment(1), options, true, 0)
    const bright = meter.baseBrightness!
    meter.configure(environment(0), options, true, 0)
    expect(meter.baseBrightness).toBe(bright)
    advance(meter, 0, 1000)
    expect(meter.baseBrightness!).toBeLessThan(bright)
    expect(meter.baseBrightness!).toBeGreaterThan(options.darkBase)
    const intermediate = meter.baseBrightness!
    advance(meter, 1000, 6000)
    expect(meter.baseBrightness!).toBeLessThan(intermediate)
    expect(meter.lightScale).toBe(1)
    expect(meter.cameraExposure).toBe(1)
    meter.configure(environment(1), { ...options, darkBase: 0.8, brightBase: 0.1 }, true, 20000)
    expect(meter.baseBrightness).toBe(0.8)
    meter.configure(environment(0), options, false, 21000)
    expect(meter.baseBrightness).toBeUndefined()
  })

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
