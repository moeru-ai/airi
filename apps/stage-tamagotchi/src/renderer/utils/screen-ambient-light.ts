import type {
  Live2DAmbientLightDirection,
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

/** Contains the weighted light color and the pixel decisions that produced it. */
export interface ScreenAmbientLightSamplingResult {
  sample?: Live2DAmbientLightSample
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
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / responseMs)

  return {
    red: mix(previous.red, next.red, alpha),
    green: mix(previous.green, next.green, alpha),
    blue: mix(previous.blue, next.blue, alpha),
    luminance: mix(previous.luminance, next.luminance, alpha),
  }
}

function collectWeightedColor(
  frame: PixelFrame,
  region: SampleRegion,
  options: Live2DAmbientLightSamplingOptions,
): ScreenAmbientLightSamplingResult {
  let weightedRed = 0
  let weightedGreen = 0
  let weightedBlue = 0
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
      weightedRed += linearRed * colorWeight
      weightedGreen += linearGreen * colorWeight
      weightedBlue += linearBlue * colorWeight
      unweightedRed += linearRed
      unweightedGreen += linearGreen
      unweightedBlue += linearBlue
      weightTotal += colorWeight
      saturationTotal += saturation
      acceptedPixelCount += 1
    }
  }

  return {
    sample: weightTotal === 0
      ? undefined
      : sampleFromLinearSums(weightedRed, weightedGreen, weightedBlue, weightTotal),
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

function sampleFromLinearSums(
  red: number,
  green: number,
  blue: number,
  divisor: number,
): Live2DAmbientLightSample {
  const sampledRed = linearToSrgb(red / divisor)
  const sampledGreen = linearToSrgb(green / divisor)
  const sampledBlue = linearToSrgb(blue / divisor)

  return {
    red: sampledRed,
    green: sampledGreen,
    blue: sampledBlue,
    luminance: sampledRed * 0.2126 + sampledGreen * 0.7152 + sampledBlue * 0.0722,
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
    luminance: red * 0.2126 + green * 0.7152 + blue * 0.0722,
  }
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
