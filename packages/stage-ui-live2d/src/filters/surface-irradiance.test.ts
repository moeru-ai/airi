import { describe, expect, it } from 'vitest'

import { screenLightCount, writeScreenLights } from './surface-irradiance'

describe('screen radiance resampling', () => {
  it('preserves total emitting energy when map cells cross tile boundaries', () => {
    const map = { width: 3, height: 3, data: new Float32Array(27) }
    map.data[12] = 1
    const target = new Float32Array(screenLightCount * 3)
    writeScreenLights(map, target)
    const red = target.filter((_, i) => i % 3 === 0)
    expect(red.reduce((sum, value) => sum + value, 0) / screenLightCount).toBeCloseTo(1 / 9, 6)
    expect(target[0]).toBe(0)
    expect(target[target.length - 3]).toBe(0)
  })

  it('keeps the same uniform screen radiance at different source resolutions', () => {
    const target = new Float32Array(screenLightCount * 3)
    writeScreenLights({ width: 5, height: 7, data: new Float32Array(5 * 7 * 3).fill(0.25) }, target)
    for (const value of target) expect(value).toBeCloseTo(0.25, 6)
  })
})
