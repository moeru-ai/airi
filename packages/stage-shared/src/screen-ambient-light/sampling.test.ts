import type { AmbientLightMap } from './environment'

import { describe, expect, it } from 'vitest'

import {
  ambientLightDefaults,
  ambientLightMapMargin,
  ambientLightMapSize,
  averageAmbientLightMap,
} from './environment'
import {
  ambientLightSampleFromHex,
  sampleScreenAmbientLight,
  smoothAmbientLightEnvironment,
  uniformAmbientLightEnvironment,
} from './sampling'

const samplingOptions = ambientLightDefaults.sampling
const displayAspect = 16 / 9
/** Window that the positional cases share, at the center of the frame. */
const centeredWindow = { x: 0.375, y: 0.25, width: 0.25, height: 0.5 }

describe('screen ambient light sampling', () => {
  it('counts painted, transparent, and accepted pixels in the region it reads', () => {
    const frame = createFrame(5, 1, [100, 50, 200, 255])
    setPixel(frame, 1, 0, [100, 50, 200, 0])

    const result = sampleScreenAmbientLight(frame, {
      // The window covers the first pixel. No mask arrives, so that pixel may
      // hold the character and cannot be measured.
      exclude: { x: 0, y: 0, width: 0.2, height: 1 },
      displayAspect,
    }, samplingOptions)

    // The sampler reads the window plus 1.4 window widths beside it, which is
    // three pixels here. The last two pixels of the frame cannot reach the
    // maps through the blur, so they are not read and not counted.
    expect(result.diagnostics).toEqual({
      totalPixelCount: 3,
      excludedPixelCount: 1,
      transparentPixelCount: 1,
      acceptedPixelCount: 1,
      seeThroughPixelCount: 0,
    })
  })

  it('measures the same maps whatever the frame resolution is', () => {
    // ROOT CAUSE:
    //
    // A blur over the whole frame at frame resolution costs more as the capture
    // grows: 11 ms per capture at 256 x 192. The measurement sums the frame onto
    // a grid of about 24 cells per window height before it blurs, which is twice
    // the density the maps can hold. The same scene at four times the resolution
    // must therefore give the same maps.
    const coarse = createFrame(64, 48, [0, 0, 0, 255])
    fillPixels(coarse, 8, 0, 16, 48, [255, 0, 0, 255])
    const fine = createFrame(256, 192, [0, 0, 0, 255])
    fillPixels(fine, 32, 0, 64, 192, [255, 0, 0, 255])

    const region = { exclude: centeredWindow, displayAspect }
    const fromCoarse = sampleScreenAmbientLight(coarse, region, samplingOptions).environment
    const fromFine = sampleScreenAmbientLight(fine, region, samplingOptions).environment

    for (const [windowU, windowV] of [[-0.2, 0.5], [0.5, 0.5], [1.2, 0.5], [0.5, -0.3]] as const) {
      for (const map of ['contact', 'surround'] as const) {
        const coarseLight = lightAt(fromCoarse[map], windowU, windowV)
        const fineLight = lightAt(fromFine[map], windowU, windowV)
        for (let channel = 0; channel < 3; channel += 1)
          expect(fineLight[channel], `${map} at ${windowU}, ${windowV} channel ${channel}`).toBeCloseTo(coarseLight[channel], 1)
      }
    }
    expect(fromFine.exposure).toBeCloseTo(fromCoarse.exposure, 1)
    expect(fromFine.behindLuminance).toBeCloseTo(fromCoarse.behindLuminance, 1)
  })

  it('measures a dark desktop as a low exposure even though it has no color', () => {
    // ROOT CAUSE:
    //
    // Rejecting near-black pixels before the measurement leaves a black screen
    // with no sample at all, and the model then keeps its previous exposure. A
    // dark desktop must dim the model, so every visible pixel reaches the maps
    // and the exposure follows their mean.
    const frame = createFrame(8, 6, [4, 4, 4, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
      displayAspect,
    }, samplingOptions)

    expect(result.environment.exposure).toBeLessThan(0.05)
    expect(averageAmbientLightMap(result.environment.surround)[0]).toBeLessThan(0.01)
  })

  it('puts the color of each side of the screen in the texels of that side', () => {
    const frame = blackFrame()
    // Red against the left edge of the window, nothing on the right.
    fillPixels(frame, 8, 0, 16, 48, [255, 0, 0, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: centeredWindow,
      displayAspect,
    }, samplingOptions)

    const contact = result.environment.contact
    const surround = result.environment.surround
    expect(lightAt(contact, -0.2, 0.5)[0]).toBeGreaterThan(0.5)
    expect(lightAt(contact, 1.2, 0.5)[0]).toBeLessThan(0.01)
    expect(lightAt(surround, -0.2, 0.5)[0]).toBeGreaterThan(lightAt(surround, 1.2, 0.5)[0] + 0.2)
  })

  it('keeps the lower half dark when the light beside the window sits above it', () => {
    // ROOT CAUSE:
    //
    // A direction from the model center carries no distance along itself, so a
    // lookup by direction gives one color to everything on that side. A red
    // window beside the head would then paint the lower-left sleeve red while
    // the desktop next to that sleeve is black. The maps hold a screen
    // position, so the sleeve reads the texel next to the sleeve.
    const frame = blackFrame()
    // Red beside the window, but only above the vertical middle of the window.
    fillPixels(frame, 8, 0, 16, 24, [255, 0, 0, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: centeredWindow,
      displayAspect,
    }, samplingOptions)

    const contact = result.environment.contact
    const surround = result.environment.surround
    expect(lightAt(contact, -0.2, 0.1)[0]).toBeGreaterThan(0.5)
    expect(lightAt(contact, -0.2, 0.9)[0]).toBeLessThan(0.01)
    // The wide blur still reaches down, but far less than at the lit height.
    // Measured: 0.87 at the top and 0.23 at the bottom.
    expect(lightAt(surround, -0.2, 0.9)[0]).toBeLessThan(lightAt(surround, -0.2, 0.1)[0] * 0.5)
  })

  it('never lets the character reach the light maps', () => {
    // ROOT CAUSE:
    //
    // The capture contains the AIRI window composited over the desktop, so the
    // window rectangle holds the character too. Averaging the character back
    // into the light it is lit by compounds every frame until the color runs
    // away. Only pixels that the mask reports as unpainted may contribute, and
    // the normalized convolution fills the hole they leave from the content
    // around it.
    const frame = createFrame(32, 32, [10, 10, 12, 255])
    // A saturated magenta stands in for the character. Nothing else in the
    // frame is magenta, so any trace of it in a map is feedback.
    fillPixels(frame, 8, 8, 16, 16, [255, 0, 255, 255])
    const painted = new Uint8ClampedArray(32 * 32)
    fillMask(painted, 32, 8, 8, 16, 16, 255)

    const result = sampleScreenAmbientLight(frame, {
      exclude: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      displayAspect: 1,
      paintedAlpha: painted,
    }, samplingOptions)

    expect(result.diagnostics.seeThroughPixelCount).toBe(0)
    expect(result.diagnostics.excludedPixelCount).toBe(256)
    expect(largestChannel(result.environment.contact, 0)).toBeLessThan(0.01)
    expect(largestChannel(result.environment.contact, 2)).toBeLessThan(0.01)
    expect(largestChannel(result.environment.surround, 0)).toBeLessThan(0.01)
    // The hole is filled from the desktop around the window, not left at zero.
    expect(result.environment.behindLuminance).toBeGreaterThan(0)
    expect(result.environment.behindLuminance).toBeLessThan(0.01)
  })

  it('measures the desktop that shows through the window', () => {
    // The maps only see beside the character where the character is painted.
    // A window hidden behind it lights the character from behind, and the
    // pixels that carry that light are the ones inside the window rectangle
    // that AIRI does not paint.
    const frame = createFrame(32, 32, [10, 10, 12, 255])
    fillPixels(frame, 8, 8, 16, 16, [40, 200, 90, 255])
    const painted = new Uint8ClampedArray(32 * 32)

    const result = sampleScreenAmbientLight(frame, {
      exclude: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      displayAspect: 1,
      paintedAlpha: painted,
    }, samplingOptions)

    const behind = lightAt(result.environment.contact, 0.5, 0.5)
    expect(result.diagnostics.seeThroughPixelCount).toBe(256)
    expect(result.diagnostics.excludedPixelCount).toBe(0)
    expect(behind[1]).toBeGreaterThan(behind[0])
    expect(behind[1]).toBeGreaterThan(behind[2])
    expect(result.environment.behindLuminance).toBeGreaterThan(0.3)
  })

  it('survives the clone that carries it to the devtools window', () => {
    // The diagnostics travel over a BroadcastChannel, which copies the snapshot
    // with the structured clone algorithm. A map that used a plain array or a
    // class instance would arrive in the devtools window as something the
    // preview cannot draw.
    const frame = blackFrame()
    fillPixels(frame, 8, 0, 16, 48, [255, 0, 0, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: centeredWindow,
      displayAspect,
    }, samplingOptions)
    const cloned = structuredClone(result.environment)

    expect(cloned.surround.data).toBeInstanceOf(Float32Array)
    expect(cloned.surround.data).toEqual(result.environment.surround.data)
    expect(cloned.contact.data).toEqual(result.environment.contact.data)
    expect(cloned.behindLuminance).toBe(result.environment.behindLuminance)
  })

  it('returns the neutral environment when the window covers the whole frame', () => {
    const frame = createFrame(4, 4, [200, 120, 40, 255])

    const result = sampleScreenAmbientLight(frame, {
      exclude: { x: 0, y: 0, width: 1, height: 1 },
      displayAspect,
    }, samplingOptions)

    const [red, green, blue] = averageAmbientLightMap(result.environment.surround)
    expect(result.environment.exposure).toBe(0.5)
    expect(result.environment.behindLuminance).toBe(0)
    expect(red).toBe(green)
    expect(green).toBe(blue)
  })

  it('reports a full exposure and a full backlight over a white screen', () => {
    const white = sampleScreenAmbientLight(createFrame(32, 32, [255, 255, 255, 255]), {
      exclude: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      displayAspect: 1,
      paintedAlpha: new Uint8ClampedArray(32 * 32),
    }, samplingOptions)
    const black = sampleScreenAmbientLight(createFrame(32, 32, [0, 0, 0, 255]), {
      exclude: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      displayAspect: 1,
      paintedAlpha: new Uint8ClampedArray(32 * 32),
    }, samplingOptions)

    expect(white.environment.exposure).toBeCloseTo(1, 2)
    expect(white.environment.behindLuminance).toBeCloseTo(1, 2)
    expect(black.environment.exposure).toBe(0)
    expect(black.environment.behindLuminance).toBe(0)
  })

  it('uses elapsed time for stable smoothing', () => {
    const previous = uniformAmbientLightEnvironment({ red: 1, green: 1, blue: 1, luminance: 1 })
    const next = uniformAmbientLightEnvironment({ red: 0, green: 0, blue: 0, luminance: 0 })

    const oneStep = smoothAmbientLightEnvironment(previous, next, 500, 500)
    const halfStep = smoothAmbientLightEnvironment(previous, next, 250, 500)
    const twoSteps = smoothAmbientLightEnvironment(halfStep, next, 250, 500)

    expect(twoSteps.exposure).toBeCloseTo(oneStep.exposure)
    expect(oneStep.exposure).toBeGreaterThan(0)
    expect(oneStep.exposure).toBeLessThan(1)
  })

  it('converges on the measured environment without writing into the previous one', () => {
    // ROOT CAUSE:
    //
    // The filter uploads a map only when the environment object changes. A
    // smoothing step that wrote into the previous map would change an
    // environment that the renderer already holds, and the upload would never
    // run again, so the maps on the GPU would drift away from the maps in the
    // store.
    const previous = uniformAmbientLightEnvironment({ red: 1, green: 1, blue: 1, luminance: 1 })
    const next = uniformAmbientLightEnvironment({ red: 0, green: 0, blue: 0, luminance: 0 })
    const previousData = Float32Array.from(previous.surround.data)

    let current = smoothAmbientLightEnvironment(previous, next, 250, 500)
    expect(current.surround.data).not.toBe(previous.surround.data)
    expect(current.surround.data).not.toBe(next.surround.data)
    expect(previous.surround.data).toEqual(previousData)

    for (let step = 0; step < 40; step += 1)
      current = smoothAmbientLightEnvironment(current, next, 250, 500)

    expect(current.exposure).toBeCloseTo(next.exposure, 3)
    expect(current.behindLuminance).toBeCloseTo(0, 3)
    expect(averageAmbientLightMap(current.contact)[0]).toBeCloseTo(0, 3)
  })

  it('builds a uniform environment for a forced color', () => {
    const environment = uniformAmbientLightEnvironment({ red: 0.5, green: 0.25, blue: 0.75, luminance: 0.34 })
    const [red, green, blue] = averageAmbientLightMap(environment.surround)

    // The sample carries sRGB channels and the maps carry linear light.
    expect(red).toBeCloseTo(0.2140, 3)
    expect(green).toBeCloseTo(0.0508, 3)
    expect(blue).toBeCloseTo(0.5225, 3)
    expect(averageAmbientLightMap(environment.contact)).toEqual([red, green, blue])
    expect(environment.behindLuminance).toBe(0.34)
    expect(environment.exposure).toBeGreaterThan(0.34)
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

  it('stays inside the frame budget of one capture', () => {
    // The capture runs at up to 20 frames per second on the renderer thread, so
    // one measurement has to stay far below one animation frame. The budget is
    // loose on purpose: it catches an algorithmic regression, such as a blur
    // whose cost grows with its radius, without failing on a slow machine.
    // Measured on an Apple M-series laptop: 0.95 ms per call.
    const frame = createFrame(128, 96, [90, 110, 140, 255])
    fillPixels(frame, 0, 0, 40, 96, [220, 40, 40, 255])
    const painted = new Uint8ClampedArray(128 * 96)
    fillMask(painted, 128, 46, 25, 36, 46, 255)
    const region = {
      exclude: { x: 46 / 128, y: 25 / 96, width: 36 / 128, height: 46 / 96 },
      displayAspect,
      paintedAlpha: painted,
    }

    // One warm-up call lets the engine compile the loops before the timer runs.
    sampleScreenAmbientLight(frame, region, samplingOptions)
    const startedAt = performance.now()
    for (let call = 0; call < 200; call += 1)
      sampleScreenAmbientLight(frame, region, samplingOptions)
    const meanMs = (performance.now() - startedAt) / 200

    expect(meanMs).toBeLessThan(4)
  })
})

function blackFrame() {
  return createFrame(64, 48, [0, 0, 0, 255])
}

/**
 * Reads a map the way the shader does, at a position given in window
 * coordinates: 0 is the left or top edge of the AIRI window and 1 is the right
 * or bottom edge, so -0.2 lies beside the window and 0.5 is its center.
 */
function lightAt(map: AmbientLightMap, windowU: number, windowV: number) {
  const span = 1 + 2 * ambientLightMapMargin
  const column = texelIndex((windowU + ambientLightMapMargin) / span)
  const row = texelIndex((windowV + ambientLightMapMargin) / span)
  const offset = (row * ambientLightMapSize + column) * 3
  return [map.data[offset], map.data[offset + 1], map.data[offset + 2]]
}

function texelIndex(mapCoordinate: number) {
  return Math.min(
    ambientLightMapSize - 1,
    Math.max(0, Math.floor(mapCoordinate * ambientLightMapSize)),
  )
}

function largestChannel(map: AmbientLightMap, channel: number) {
  let largest = 0
  for (let texel = 0; texel < map.width * map.height; texel += 1)
    largest = Math.max(largest, map.data[texel * 3 + channel])

  return largest
}

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

function fillPixels(
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

function fillMask(
  mask: Uint8ClampedArray,
  frameWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
) {
  for (let currentY = y; currentY < y + height; currentY += 1) {
    for (let currentX = x; currentX < x + width; currentX += 1)
      mask[currentY * frameWidth + currentX] = alpha
  }
}
