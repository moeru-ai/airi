import { live2dAmbientLightDefaults } from '@proj-airi/stage-ui-live2d/stores'
import { describe, expect, it } from 'vitest'

import {
  ambientLightSampleFromHex,
  calculateWindowLightDirection,
  sampleScreenAmbientLight,
  smoothAmbientLight,
  smoothAmbientLightLobes,
} from './screen-ambient-light'

const samplingOptions = live2dAmbientLightDefaults.sampling

describe('screen ambient light sampling', () => {
  it('reports why each captured pixel was accepted or rejected', () => {
    const frame = createFrame(5, 1, [100, 50, 200, 255])
    setPixel(frame, 1, 0, [100, 50, 200, 0])
    setPixel(frame, 2, 0, [0, 0, 0, 255])
    setPixel(frame, 3, 0, [255, 255, 255, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: { x: 0, y: 0, width: 0.2, height: 1 },
    }, samplingOptions)

    expect(result).toEqual(expect.objectContaining({
      diagnostics: {
        acceptedPixelCount: 1,
        averageSaturation: expect.any(Number),
        blackPixelCount: 1,
        excludedPixelCount: 1,
        totalPixelCount: 5,
        transparentPixelCount: 1,
        unweightedSample: expect.any(Object),
        weightTotal: expect.any(Number),
        whitePixelCount: 1,
      },
      sample: expect.any(Object),
    }))
  })

  it('samples the display and excludes the AIRI window itself', () => {
    const frame = createFrame(4, 2, [20, 40, 80, 255])
    setPixel(frame, 1, 0, [255, 0, 0, 255])
    setPixel(frame, 2, 0, [255, 0, 0, 255])
    setPixel(frame, 1, 1, [120, 210, 255, 255])
    setPixel(frame, 2, 1, [120, 210, 255, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: { x: 0.25, y: 0, width: 0.5, height: 0.5 },
    }, samplingOptions)

    expect(result.sample).toBeDefined()
    expect(result.sample!.blue).toBeGreaterThan(result.sample!.red)
    expect(result.sample!.green).toBeGreaterThan(result.sample!.red)
  })

  it('ignores black letterboxing while sampling the rest of the display', () => {
    const frame = createFrame(3, 1, [0, 0, 0, 255])
    setPixel(frame, 0, 0, [190, 80, 220, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: { x: 0.33, y: 0, width: 0.34, height: 1 },
    }, samplingOptions)

    expect(result.sample).toBeDefined()
    expect(result.sample!.blue).toBeGreaterThan(result.sample!.green)
  })

  it('uses elapsed time for stable smoothing', () => {
    const previous = { red: 1, green: 1, blue: 1, luminance: 1 }
    const next = { red: 0, green: 0, blue: 0, luminance: 0 }

    const oneStep = smoothAmbientLight(previous, next, 500, 500)
    const halfStep = smoothAmbientLight(previous, next, 250, 500)
    const twoSteps = smoothAmbientLight(halfStep, next, 250, 500)

    expect(twoSteps.red).toBeCloseTo(oneStep.red)
    expect(oneStep.red).toBeGreaterThan(0)
    expect(oneStep.red).toBeLessThan(1)
  })

  it('keeps separate bright regions as separate light lobes', () => {
    const frame = createFrame(12, 6, [110, 35, 85, 255])
    setRectangle(frame, 1, 1, 2, 2, [255, 210, 20, 255])
    setRectangle(frame, 9, 3, 2, 2, [20, 210, 255, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: { x: 0.45, y: 0.35, width: 0.1, height: 0.3 },
    }, samplingOptions)

    expect(result.lobes).toHaveLength(2)
    expect(result.lobes.some(lobe => lobe.sample.red > lobe.sample.blue)).toBe(true)
    expect(result.lobes.some(lobe => lobe.sample.blue > lobe.sample.red)).toBe(true)
    expect(result.lobes.some(lobe => lobe.direction.x < 0)).toBe(true)
    expect(result.lobes.some(lobe => lobe.direction.x > 0)).toBe(true)
  })

  it('fades unmatched light lobes without changing matched identities', () => {
    const previous = [
      createLobe({ x: -1, y: 0 }, { x: 0.2, y: 0.5 }, [1, 0, 0], 0.8),
      createLobe({ x: 1, y: 0 }, { x: 0.8, y: 0.5 }, [0, 0, 1], 0.6),
    ]
    const next = [
      createLobe({ x: 0.9, y: 0.1 }, { x: 0.78, y: 0.52 }, [0, 0.2, 1], 0.9),
    ]

    const smoothed = smoothAmbientLightLobes(previous, next, 250, 500)

    expect(smoothed).toHaveLength(2)
    expect(smoothed[0].direction.x).toBe(-1)
    expect(smoothed[0].intensity).toBeLessThan(previous[0].intensity)
    expect(smoothed[1].direction.x).toBeGreaterThan(0.9)
    expect(smoothed[1].sample.blue).toBe(1)
    expect(smoothed[1].intensity).toBeGreaterThan(previous[1].intensity)
  })

  it('points directional light from the AIRI window toward the display center', () => {
    const direction = calculateWindowLightDirection(
      { x: 0, y: 0, width: 1000, height: 800 },
      { x: 800, y: 600, width: 200, height: 200 },
    )

    expect(direction.x).toBeCloseTo(-0.8)
    expect(direction.y).toBeCloseTo(-0.6)
  })

  it('uses uniform light when the AIRI window is at the display center', () => {
    const direction = calculateWindowLightDirection(
      { x: -500, y: -400, width: 1000, height: 800 },
      { x: -100, y: -100, width: 200, height: 200 },
    )

    expect(direction).toEqual({ x: 0, y: 0 })
  })

  it('converts a forced test color without screen capture', () => {
    const sample = ambientLightSampleFromHex('#8040c0')

    expect(sample).toBeDefined()
    expect(sample!.red).toBeCloseTo(128 / 255)
    expect(sample!.green).toBeCloseTo(64 / 255)
    expect(sample!.blue).toBeCloseTo(192 / 255)
    expect(ambientLightSampleFromHex('#8040c0ff')).toEqual(sample)
    expect(ambientLightSampleFromHex('purple')).toBeUndefined()
  })
})

function createFrame(width: number, height: number, color: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1)
    data.set(color, index * 4)

  return { data, width, height }
}

function setPixel(
  frame: ReturnType<typeof createFrame>,
  x: number,
  y: number,
  color: [number, number, number, number],
) {
  frame.data.set(color, (y * frame.width + x) * 4)
}

function setRectangle(
  frame: ReturnType<typeof createFrame>,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number, number],
) {
  for (let currentY = y; currentY < y + height; currentY += 1) {
    for (let currentX = x; currentX < x + width; currentX += 1)
      setPixel(frame, currentX, currentY, color)
  }
}

function createLobe(
  direction: { x: number, y: number },
  position: { x: number, y: number },
  [red, green, blue]: [number, number, number],
  intensity: number,
) {
  return {
    coverage: 0.2,
    direction,
    intensity,
    position,
    sample: {
      red,
      green,
      blue,
      luminance: red * 0.2126 + green * 0.7152 + blue * 0.0722,
    },
  }
}
