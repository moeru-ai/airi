import { live2dAmbientLightDefaults } from '@proj-airi/stage-ui-live2d/stores'
import { describe, expect, it } from 'vitest'

import {
  ambientLightSampleFromHex,
  calculateWindowLightDirection,
  sampleScreenAmbientLight,
  smoothAmbientLight,
} from './screen-ambient-light'

const samplingOptions = live2dAmbientLightDefaults.sampling

describe('screen ambient light sampling', () => {
  it('samples the display and excludes the AIRI window itself', () => {
    const frame = createFrame(4, 2, [20, 40, 80, 255])
    setPixel(frame, 1, 0, [255, 0, 0, 255])
    setPixel(frame, 2, 0, [255, 0, 0, 255])
    setPixel(frame, 1, 1, [120, 210, 255, 255])
    setPixel(frame, 2, 1, [120, 210, 255, 255])

    const sample = sampleScreenAmbientLight(frame, {
      exclude: { x: 0.25, y: 0, width: 0.5, height: 0.5 },
    }, samplingOptions)

    expect(sample).toBeDefined()
    expect(sample!.blue).toBeGreaterThan(sample!.red)
    expect(sample!.green).toBeGreaterThan(sample!.red)
  })

  it('ignores black letterboxing while sampling the rest of the display', () => {
    const frame = createFrame(3, 1, [0, 0, 0, 255])
    setPixel(frame, 0, 0, [190, 80, 220, 255])

    const sample = sampleScreenAmbientLight(frame, {
      exclude: { x: 0.33, y: 0, width: 0.34, height: 1 },
    }, samplingOptions)

    expect(sample).toBeDefined()
    expect(sample!.blue).toBeGreaterThan(sample!.green)
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
