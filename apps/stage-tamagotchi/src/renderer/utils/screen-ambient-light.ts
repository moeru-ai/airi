import type {
  Live2DAmbientLightDirection,
  Live2DAmbientLightLobe,
  Live2DAmbientLightSample,
  Live2DAmbientLightSamplingOptions,
} from '@proj-airi/stage-ui-live2d'

import type {
  ScreenAmbientLightSamplingDiagnostics,
} from '../../shared/screen-ambient-light-diagnostics'

export type { ScreenAmbientLightSamplingDiagnostics } from '../../shared/screen-ambient-light-diagnostics'

export interface PixelFrame {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface NormalizedRectangle {
  x: number
  y: number
  width: number
  height: number
}

interface SampleRegion {
  exclude: NormalizedRectangle
}

interface AcceptedPixel {
  x: number
  y: number
  normalizedX: number
  normalizedY: number
  linearRed: number
  linearGreen: number
  linearBlue: number
  luminance: number
  saturation: number
}

interface DescribedLightLobe extends Live2DAmbientLightLobe {
  energy: number
  pixels: readonly AcceptedPixel[]
}

const maximumLightLobeCount = 3
const brightPixelQuantile = 0.95
const minimumBrightRegionPixelCount = 2

/** Contains the weighted light color and the pixel decisions that produced it. */
export interface ScreenAmbientLightSamplingResult {
  sample?: Live2DAmbientLightSample
  lobes: Live2DAmbientLightLobe[]
  diagnostics: ScreenAmbientLightSamplingDiagnostics
}

/**
 * Extracts one representative light color from a coarse screen frame.
 *
 * Pixels inside the AIRI window are excluded so the model cannot feed its own
 * colors back into the next sample.
 */
export function sampleScreenAmbientLight(
  frame: PixelFrame,
  region: SampleRegion,
  options: Live2DAmbientLightSamplingOptions,
): ScreenAmbientLightSamplingResult {
  return collectWeightedColor(frame, region, options)
}

/** Smooths capture updates without making the result depend on the capture frame rate. */
export function smoothAmbientLight(
  previous: Live2DAmbientLightSample,
  next: Live2DAmbientLightSample,
  elapsedMs: number,
  responseMs: number,
): Live2DAmbientLightSample {
  const alpha = smoothingAlpha(elapsedMs, responseMs)

  return {
    red: mix(previous.red, next.red, alpha),
    green: mix(previous.green, next.green, alpha),
    blue: mix(previous.blue, next.blue, alpha),
    luminance: mix(previous.luminance, next.luminance, alpha),
  }
}

/**
 * Matches and smooths bright regions so their shader slots stay stable.
 * Unmatched regions fade instead of appearing or disappearing in one frame.
 */
export function smoothAmbientLightLobes(
  previous: readonly Live2DAmbientLightLobe[],
  next: readonly Live2DAmbientLightLobe[],
  elapsedMs: number,
  responseMs: number,
): Live2DAmbientLightLobe[] {
  const alpha = smoothingAlpha(elapsedMs, responseMs)
  const remainingNext = [...next]
  const smoothed: Live2DAmbientLightLobe[] = []

  for (const previousLobe of previous) {
    const matchIndex = findNearestLobeIndex(previousLobe, remainingNext)
    const nextLobe = matchIndex >= 0 ? remainingNext.splice(matchIndex, 1)[0] : undefined
    if (!nextLobe) {
      const intensity = mix(previousLobe.intensity, 0, alpha)
      if (intensity > 0.02)
        smoothed.push({ ...previousLobe, intensity })
      continue
    }

    smoothed.push({
      position: mixDirection(previousLobe.position, nextLobe.position, alpha),
      direction: normalizeDirection(mixDirection(previousLobe.direction, nextLobe.direction, alpha)),
      intensity: mix(previousLobe.intensity, nextLobe.intensity, alpha),
      coverage: mix(previousLobe.coverage, nextLobe.coverage, alpha),
      sample: smoothAmbientLight(previousLobe.sample, nextLobe.sample, elapsedMs, responseMs),
    })
  }

  for (const nextLobe of remainingNext) {
    smoothed.push({
      ...nextLobe,
      intensity: mix(0, nextLobe.intensity, alpha),
    })
  }

  return smoothed.slice(0, maximumLightLobeCount)
}

function collectWeightedColor(
  frame: PixelFrame,
  region: SampleRegion,
  options: Live2DAmbientLightSamplingOptions,
): ScreenAmbientLightSamplingResult {
  let unweightedRed = 0
  let unweightedGreen = 0
  let unweightedBlue = 0
  let weightTotal = 0
  let saturationTotal = 0
  let excludedPixelCount = 0
  let transparentPixelCount = 0
  let blackPixelCount = 0
  let whitePixelCount = 0
  let acceptedPixelCount = 0
  const acceptedPixels: AcceptedPixel[] = []
  const acceptedPixelsByOffset: Array<AcceptedPixel | undefined> = Array.from({ length: frame.width * frame.height })

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const normalizedX = (x + 0.5) / frame.width
      const normalizedY = (y + 0.5) / frame.height
      if (contains(region.exclude, normalizedX, normalizedY)) {
        excludedPixelCount += 1
        continue
      }
      const offset = (y * frame.width + x) * 4
      if (frame.data[offset + 3] === 0) {
        transparentPixelCount += 1
        continue
      }

      const currentRed = frame.data[offset] / 255
      const currentGreen = frame.data[offset + 1] / 255
      const currentBlue = frame.data[offset + 2] / 255
      const maximum = Math.max(currentRed, currentGreen, currentBlue)
      const minimum = Math.min(currentRed, currentGreen, currentBlue)

      // Near-black and near-white pixels usually come from window chrome,
      // letterboxing, or text. They carry little useful color information.
      if (maximum < options.blackCutoff) {
        blackPixelCount += 1
        continue
      }
      if (minimum > options.whiteCutoff) {
        whitePixelCount += 1
        continue
      }

      const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum
      const colorWeight = options.neutralColorWeight + saturation * (1 - options.neutralColorWeight)
      const linearRed = srgbToLinear(currentRed)
      const linearGreen = srgbToLinear(currentGreen)
      const linearBlue = srgbToLinear(currentBlue)
      const luminance = relativeLuminance(linearRed, linearGreen, linearBlue)
      const pixel: AcceptedPixel = {
        x,
        y,
        normalizedX,
        normalizedY,
        linearRed,
        linearGreen,
        linearBlue,
        luminance,
        saturation,
      }
      acceptedPixels.push(pixel)
      acceptedPixelsByOffset[y * frame.width + x] = pixel
      unweightedRed += linearRed
      unweightedGreen += linearGreen
      unweightedBlue += linearBlue
      weightTotal += colorWeight
      saturationTotal += saturation
      acceptedPixelCount += 1
    }
  }

  const { fillPixels, lobes } = extractLightLobes(
    acceptedPixels,
    acceptedPixelsByOffset,
    frame.width,
    frame.height,
    region.exclude,
  )
  const fill = collectSaturationWeightedColor(
    fillPixels.length > 0 ? fillPixels : acceptedPixels,
    options.neutralColorWeight,
  )

  return {
    sample: fill?.sample,
    lobes,
    diagnostics: {
      totalPixelCount: frame.width * frame.height,
      excludedPixelCount,
      transparentPixelCount,
      blackPixelCount,
      whitePixelCount,
      acceptedPixelCount,
      weightTotal,
      averageSaturation: acceptedPixelCount === 0 ? 0 : saturationTotal / acceptedPixelCount,
      unweightedSample: acceptedPixelCount === 0
        ? undefined
        : sampleFromLinearSums(unweightedRed, unweightedGreen, unweightedBlue, acceptedPixelCount),
    },
  }
}

function extractLightLobes(
  acceptedPixels: readonly AcceptedPixel[],
  acceptedPixelsByOffset: readonly (AcceptedPixel | undefined)[],
  width: number,
  height: number,
  excludedRegion: NormalizedRectangle,
) {
  if (acceptedPixels.length === 0)
    return { fillPixels: [] as AcceptedPixel[], lobes: [] as Live2DAmbientLightLobe[] }

  const luminances = acceptedPixels.map(pixel => pixel.luminance).sort((left, right) => left - right)
  const logAverageLuminance = Math.exp(
    acceptedPixels.reduce((total, pixel) => total + Math.log(0.0001 + pixel.luminance), 0)
    / acceptedPixels.length,
  )
  const threshold = Math.max(
    quantile(luminances, brightPixelQuantile),
    logAverageLuminance * 1.18,
  )
  const brightOffsets = new Set(
    acceptedPixels
      .filter(pixel => pixel.luminance >= threshold)
      .map(pixel => pixel.y * width + pixel.x),
  )
  const components = collectBrightComponents(brightOffsets, acceptedPixelsByOffset, width, height)
    .filter(component => component.length >= minimumBrightRegionPixelCount)
    .map(component => describeLightLobe(component, logAverageLuminance, excludedRegion, acceptedPixels.length))
    .filter((lobe): lobe is DescribedLightLobe => lobe !== undefined)
    .sort((left, right) => right.energy - left.energy)
    .slice(0, maximumLightLobeCount)

  const selectedOffsets = new Set<number>()
  for (const component of components) {
    for (const pixel of component.pixels)
      selectedOffsets.add(pixel.y * width + pixel.x)
  }

  const energyTotal = components.reduce((total, component) => total + component.energy, 0)
  const lobes = components.map(({ energy, pixels: _pixels, ...lobe }) => ({
    ...lobe,
    intensity: energyTotal === 0 ? 0 : clamp(Math.sqrt(energy / energyTotal) * 1.25, 0, 1),
  }))

  return {
    fillPixels: acceptedPixels.filter(pixel => !selectedOffsets.has(pixel.y * width + pixel.x)),
    lobes,
  }
}

function collectBrightComponents(
  brightOffsets: ReadonlySet<number>,
  acceptedPixelsByOffset: readonly (AcceptedPixel | undefined)[],
  width: number,
  height: number,
) {
  const remaining = new Set(brightOffsets)
  const components: AcceptedPixel[][] = []

  while (remaining.size > 0) {
    const firstOffset = remaining.values().next().value as number
    const queue = [firstOffset]
    const component: AcceptedPixel[] = []
    remaining.delete(firstOffset)

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const offset = queue[queueIndex]
      const pixel = acceptedPixelsByOffset[offset]
      if (!pixel)
        continue
      component.push(pixel)

      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0)
            continue
          const nextX = pixel.x + deltaX
          const nextY = pixel.y + deltaY
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height)
            continue
          const nextOffset = nextY * width + nextX
          if (!remaining.delete(nextOffset))
            continue
          queue.push(nextOffset)
        }
      }
    }

    components.push(component)
  }

  return components
}

function describeLightLobe(
  pixels: readonly AcceptedPixel[],
  logAverageLuminance: number,
  excludedRegion: NormalizedRectangle,
  acceptedPixelCount: number,
): DescribedLightLobe | undefined {
  let energy = 0
  let weightedX = 0
  let weightedY = 0
  let weightedRed = 0
  let weightedGreen = 0
  let weightedBlue = 0

  for (const pixel of pixels) {
    const pixelEnergy = Math.max(0, pixel.luminance - logAverageLuminance)
    energy += pixelEnergy
    weightedX += pixel.normalizedX * pixelEnergy
    weightedY += pixel.normalizedY * pixelEnergy
    weightedRed += pixel.linearRed * pixelEnergy
    weightedGreen += pixel.linearGreen * pixelEnergy
    weightedBlue += pixel.linearBlue * pixelEnergy
  }

  if (energy <= 0)
    return undefined

  const position = { x: weightedX / energy, y: weightedY / energy }
  let spread = 0
  for (const pixel of pixels) {
    const pixelEnergy = Math.max(0, pixel.luminance - logAverageLuminance)
    const deltaX = pixel.normalizedX - position.x
    const deltaY = pixel.normalizedY - position.y
    spread += (deltaX * deltaX + deltaY * deltaY) * pixelEnergy
  }
  spread = Math.sqrt(spread / energy)

  const windowCenter = {
    x: excludedRegion.x + excludedRegion.width / 2,
    y: excludedRegion.y + excludedRegion.height / 2,
  }

  return {
    pixels,
    energy,
    position,
    direction: normalizeDirection({
      x: position.x - windowCenter.x,
      y: position.y - windowCenter.y,
    }),
    coverage: clamp(
      0.08 + spread * 2.5 + Math.sqrt(pixels.length / acceptedPixelCount) * 0.35,
      0.08,
      0.65,
    ),
    intensity: 0,
    sample: sampleFromLinearSums(weightedRed, weightedGreen, weightedBlue, energy),
  }
}

function collectSaturationWeightedColor(
  pixels: readonly AcceptedPixel[],
  neutralColorWeight: number,
) {
  if (pixels.length === 0)
    return undefined

  let red = 0
  let green = 0
  let blue = 0
  let weightTotal = 0
  for (const pixel of pixels) {
    const weight = neutralColorWeight + pixel.saturation * (1 - neutralColorWeight)
    red += pixel.linearRed * weight
    green += pixel.linearGreen * weight
    blue += pixel.linearBlue * weight
    weightTotal += weight
  }

  return {
    sample: sampleFromLinearSums(red, green, blue, weightTotal),
    weightTotal,
  }
}

function sampleFromLinearSums(
  red: number,
  green: number,
  blue: number,
  divisor: number,
): Live2DAmbientLightSample {
  const sampledRed = linearToSrgb(red / divisor)
  const sampledGreen = linearToSrgb(green / divisor)
  const sampledBlue = linearToSrgb(blue / divisor)
  const luminance = relativeLuminance(red / divisor, green / divisor, blue / divisor)

  return {
    red: sampledRed,
    green: sampledGreen,
    blue: sampledBlue,
    luminance,
  }
}

/**
 * Calculates the screen-space light direction from the window center to the display center.
 *
 * @example
 * calculateWindowLightDirection(
 *   { x: 0, y: 0, width: 1000, height: 800 },
 *   { x: 800, y: 600, width: 200, height: 200 },
 * )
 * // => { x: -0.8, y: -0.6 }
 */
export function calculateWindowLightDirection(
  display: NormalizedRectangle,
  window: NormalizedRectangle,
): Live2DAmbientLightDirection {
  const horizontalDistance = display.x + display.width / 2 - (window.x + window.width / 2)
  const verticalDistance = display.y + display.height / 2 - (window.y + window.height / 2)
  const distance = Math.hypot(horizontalDistance, verticalDistance)

  if (distance === 0)
    return { x: 0, y: 0 }

  return {
    x: horizontalDistance / distance,
    y: verticalDistance / distance,
  }
}

/**
 * Converts a six-digit or eight-digit hex color into an ambient-light sample.
 *
 * @example
 * ambientLightSampleFromHex('#8040c0')
 * // => { red: 0.502, green: 0.251, blue: 0.753, luminance: 0.340 }
 */
export function ambientLightSampleFromHex(color: string): Live2DAmbientLightSample | undefined {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})(?:[\da-f]{2})?$/i.exec(color)
  if (!match)
    return undefined

  const red = Number.parseInt(match[1], 16) / 255
  const green = Number.parseInt(match[2], 16) / 255
  const blue = Number.parseInt(match[3], 16) / 255

  return {
    red,
    green,
    blue,
    luminance: relativeLuminance(srgbToLinear(red), srgbToLinear(green), srgbToLinear(blue)),
  }
}

function findNearestLobeIndex(
  previous: Live2DAmbientLightLobe,
  candidates: readonly Live2DAmbientLightLobe[],
) {
  let nearestIndex = -1
  let nearestDistance = 0.42
  for (const [index, candidate] of candidates.entries()) {
    const positionDistance = Math.hypot(
      previous.position.x - candidate.position.x,
      previous.position.y - candidate.position.y,
    )
    const colorDistance = Math.hypot(
      previous.sample.red - candidate.sample.red,
      previous.sample.green - candidate.sample.green,
      previous.sample.blue - candidate.sample.blue,
    )
    const distance = positionDistance + colorDistance * 0.18
    if (distance >= nearestDistance)
      continue
    nearestDistance = distance
    nearestIndex = index
  }
  return nearestIndex
}

function mixDirection(
  from: Live2DAmbientLightDirection,
  to: Live2DAmbientLightDirection,
  amount: number,
) {
  return {
    x: mix(from.x, to.x, amount),
    y: mix(from.y, to.y, amount),
  }
}

function normalizeDirection(direction: Live2DAmbientLightDirection) {
  const length = Math.hypot(direction.x, direction.y)
  return length === 0
    ? { x: 0, y: 0 }
    : { x: direction.x / length, y: direction.y / length }
}

function smoothingAlpha(elapsedMs: number, responseMs: number) {
  return 1 - Math.exp(-Math.max(0, elapsedMs) / Math.max(1, responseMs))
}

function quantile(sortedValues: readonly number[], amount: number) {
  const index = Math.floor((sortedValues.length - 1) * clamp(amount, 0, 1))
  return sortedValues[index]
}

function relativeLuminance(red: number, green: number, blue: number) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contains(rectangle: NormalizedRectangle, x: number, y: number): boolean {
  return x >= rectangle.x
    && x <= rectangle.x + rectangle.width
    && y >= rectangle.y
    && y <= rectangle.y + rectangle.height
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
