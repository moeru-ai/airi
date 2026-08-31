import { describe, expect, it } from 'vitest'

import {
  ambientLightMapInteriorLuminance,
  ambientLightMapMargin,
  ambientLightMapSize,
  ambientLightNeutralEnvironment,
  averageAmbientLightMap,
  createAmbientLightMap,
} from './environment'

describe('ambient light maps', () => {
  it('creates a black map when no fill is given', () => {
    const map = createAmbientLightMap()

    expect(map.width).toBe(ambientLightMapSize)
    expect(map.height).toBe(ambientLightMapSize)
    expect(map.data).toHaveLength(ambientLightMapSize * ambientLightMapSize * 3)
    expect(map.data.every(channel => channel === 0)).toBe(true)
  })

  it('repeats the fill color over every texel', () => {
    const map = createAmbientLightMap([0.25, 0.5, 0.75])

    expect(averageAmbientLightMap(map)[0]).toBeCloseTo(0.25)
    expect(averageAmbientLightMap(map)[1]).toBeCloseTo(0.5)
    expect(averageAmbientLightMap(map)[2]).toBeCloseTo(0.75)
  })

  it('averages the whole map, margin texels included', () => {
    const map = createAmbientLightMap()
    // One half of the columns is red, the other half is black.
    for (let row = 0; row < map.height; row += 1) {
      for (let column = 0; column < map.width / 2; column += 1)
        map.data[(row * map.width + column) * 3] = 1
    }

    expect(averageAmbientLightMap(map)[0]).toBeCloseTo(0.5)
  })

  it('reads only the window interior for the luminance behind the character', () => {
    // The margin is 0.5 of the window on each side, so the interior covers map
    // uv 0.25 to 0.75. Light that sits outside the window must not reach the
    // interior darkening, because that light is beside the character.
    const map = createAmbientLightMap([1, 1, 1])
    const interiorStart = ambientLightMapMargin / (1 + 2 * ambientLightMapMargin)
    const interiorEnd = (1 + ambientLightMapMargin) / (1 + 2 * ambientLightMapMargin)
    for (let row = 0; row < map.height; row += 1) {
      const v = (row + 0.5) / map.height
      for (let column = 0; column < map.width; column += 1) {
        const u = (column + 0.5) / map.width
        if (u < interiorStart || u > interiorEnd || v < interiorStart || v > interiorEnd)
          continue

        const offset = (row * map.width + column) * 3
        map.data[offset] = 0
        map.data[offset + 1] = 0
        map.data[offset + 2] = 0
      }
    }

    expect(ambientLightMapInteriorLuminance(map)).toBe(0)
    expect(ambientLightMapInteriorLuminance(createAmbientLightMap([1, 1, 1]))).toBeCloseTo(1)
  })

  it('starts from a colorless environment with the backlight off', () => {
    const { surround, contact, exposure, behindLuminance } = ambientLightNeutralEnvironment
    const [red, green, blue] = averageAmbientLightMap(surround)

    expect(red).toBe(green)
    expect(green).toBe(blue)
    expect(averageAmbientLightMap(contact)).toEqual([red, green, blue])
    expect(exposure).toBe(0.5)
    expect(behindLuminance).toBe(0)
  })
})
