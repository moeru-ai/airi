import type {
  AmbientLightEnvironment,
  AmbientLightMap,
  AmbientLightSample,
  AmbientLightSamplingOptions,
} from './environment'

import {
  ambientLightMapInteriorLuminance,
  ambientLightMapMargin,
  ambientLightMapSize,
  ambientLightNeutralEnvironment,
  averageAmbientLightMap,
  createAmbientLightMap,
} from './environment'

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

export interface SampleRegion {
  /** The AIRI window, in display-normalized coordinates. */
  exclude: NormalizedRectangle
  /**
   * Opacity of what AIRI paints, on the same grid as the frame, from 0 to 255.
   *
   * The capture contains the AIRI window composited over the desktop, so the
   * window rectangle holds a mix of the character and the desktop showing
   * through wherever the window is transparent. This mask separates the two.
   * Where it reads zero, the captured pixel is the desktop behind the window,
   * which is the light the backlight term needs.
   *
   * Leave it out when the renderer cannot supply it. The whole window rectangle
   * then counts as painted, because a pixel that may hold the character must
   * never reach the measurement.
   */
  paintedAlpha?: Uint8ClampedArray
  /**
   * Width divided by height of the captured display.
   *
   * The measurement does not read it: the window rectangle already carries the
   * shape of the window on the display. The capture side reports it here for
   * the diagnostics view.
   */
  displayAspect: number
}

/**
 * Standard deviation of the two blurs, in window heights.
 *
 * The contact blur feeds the light wrap and the backlight rim, which must show
 * what sits directly behind or beside the silhouette, so it stays narrow. The
 * surround blur feeds the color cast over the whole model, so it reaches about
 * a third of the window height and averages a large area into one hue.
 */
const contactSigmaWindowHeights = 0.08
const surroundSigmaWindowHeights = 0.30

/**
 * Height of the stage window on the working grid, in cells.
 *
 * The maps hold 24 texels over twice the window, which is 12 per window
 * height. The grid keeps twice that density, so the bilinear read from grid to
 * map loses nothing the map can show. Measured at 20 captures per second with
 * a 256 x 192 frame, the blur over the whole frame cost 11 ms per capture; the
 * grid holds a few thousand cells whatever the frame size is.
 */
const workingWindowHeight = 24

/**
 * Painted opacity below which a pixel counts as the desktop behind the window.
 *
 * The mask is coarse: one sample pixel covers a block of tens of screen pixels,
 * so any block that clips the character carries some opacity. The threshold is
 * near zero on purpose. Sampling the character would feed the filter its own
 * output, and the error grows every frame.
 */
const seeThroughAlphaCeiling = 4

/**
 * Least blurred weight a map texel may rest on before it falls back.
 *
 * The blurred weight is a mean of the per-pixel weights over the kernel, so it
 * reaches zero only where no measurable pixel lies within reach. That happens
 * deep inside a large opaque model for the narrow contact blur.
 */
const mapSupportFloor = 1e-3

/** Describes how many captured pixels reached the environment measurement. */
export interface ScreenAmbientLightSamplingDiagnostics {
  /**
   * Pixels the sampler read: the window plus its margin and the reach of the
   * blur. The rest of the frame cannot affect the maps and is not read.
   */
  totalPixelCount: number
  /** Pixels inside the window that AIRI paints. These carry no measurement. */
  excludedPixelCount: number
  transparentPixelCount: number
  /** Pixels that contributed light to the maps. */
  acceptedPixelCount: number
  /**
   * Pixels inside the window that AIRI does not paint, which is the desktop
   * behind the character. Zero means the backlight had no data this frame.
   */
  seeThroughPixelCount: number
}

/** Contains the measured environment and the pixel decisions that produced it. */
export interface ScreenAmbientLightSamplingResult {
  environment: AmbientLightEnvironment
  diagnostics: ScreenAmbientLightSamplingDiagnostics
}

/**
 * sRGB byte to linear light, precomputed for all 256 values.
 *
 * The frame holds one byte per channel, and the extraction converts every
 * channel of every pixel. A 128 x 96 frame needs 36864 conversions per capture,
 * and the exponent in the conversion cost more than every other step together.
 */
const srgbByteToLinear = new Float32Array(256)
for (let value = 0; value < 256; value += 1)
  srgbByteToLinear[value] = srgbToLinear(value / 255)

/** Blurred light and the weight it rests on, read at the map texel centers. */
interface ResampledField {
  /** Linear RGB per texel, already divided by the weight. */
  colors: Float32Array
  /** Blurred weight per texel, from 0 to 1. */
  support: Float32Array
}

/**
 * Measures the screen around and behind the AIRI window from one coarse frame.
 *
 * The result is two light maps that cover the window plus a margin, so that the
 * shader can look light up by screen position instead of by direction from the
 * model center. The steps are:
 *
 * 1. Give every frame pixel a weight. Pixels that AIRI paints weigh nothing, so
 *    the model cannot feed its own colors back into the next sample. The
 *    saturation weight then lets colored content count for more than gray.
 * 2. Blur the weighted linear color and the weight itself, once for each of the
 *    two standard deviations.
 * 3. Divide one by the other. This normalized convolution fills the hole that
 *    the painted character leaves with the content around it.
 * 4. Read both blurred fields at the map texel centers.
 *
 * Near-black and near-white pixels are not rejected: a dark desktop must read
 * as dark, and a white document behind the model must still wrap white light
 * onto its edge.
 */
export function sampleScreenAmbientLight(
  frame: PixelFrame,
  region: SampleRegion,
  options: AmbientLightSamplingOptions,
): ScreenAmbientLightSamplingResult {
  const grid = workingGridFor(frame, region.exclude)
  // Interleaved as weighted linear red, green, and blue, then the weight
  // itself, so that one blur pass carries the numerator and the denominator of
  // the normalized convolution together. Each cell sums the frame pixels it
  // covers and is scaled back to the range of one pixel below.
  const field = new Float32Array(grid.width * grid.height * 4)
  const paintedAlpha = region.paintedAlpha
  let excludedPixelCount = 0
  let transparentPixelCount = 0
  let acceptedPixelCount = 0
  let seeThroughPixelCount = 0

  for (let y = grid.top; y < grid.bottom; y += 1) {
    const normalizedY = (y + 0.5) / frame.height
    const insideRow = normalizedY >= region.exclude.y
      && normalizedY <= region.exclude.y + region.exclude.height
    const cellRow = Math.floor((y - grid.top) / grid.scale) * grid.width

    for (let x = grid.left; x < grid.right; x += 1) {
      const index = y * frame.width + x
      const offset = index * 4
      if (frame.data[offset + 3] === 0) {
        transparentPixelCount += 1
        continue
      }

      const normalizedX = (x + 0.5) / frame.width
      const inside = insideRow
        && normalizedX >= region.exclude.x
        && normalizedX <= region.exclude.x + region.exclude.width
      if (inside) {
        // A pixel inside the window is either the character or the desktop that
        // shows through the transparent window. Without a mask the two cannot
        // be told apart, so the whole rectangle counts as painted.
        const painted = paintedAlpha?.[index]
        if (painted === undefined || painted > seeThroughAlphaCeiling) {
          excludedPixelCount += 1
          continue
        }
        seeThroughPixelCount += 1
      }

      const red = frame.data[offset]
      const green = frame.data[offset + 1]
      const blue = frame.data[offset + 2]
      const maximum = Math.max(red, green, blue)
      const saturation = maximum === 0 ? 0 : (maximum - Math.min(red, green, blue)) / maximum
      const weight = options.neutralColorWeight + saturation * (1 - options.neutralColorWeight)

      const cell = (cellRow + Math.floor((x - grid.left) / grid.scale)) * 4
      field[cell] += srgbByteToLinear[red] * weight
      field[cell + 1] += srgbByteToLinear[green] * weight
      field[cell + 2] += srgbByteToLinear[blue] * weight
      field[cell + 3] += weight
      acceptedPixelCount += 1
    }
  }

  const diagnostics: ScreenAmbientLightSamplingDiagnostics = {
    totalPixelCount: (grid.right - grid.left) * (grid.bottom - grid.top),
    excludedPixelCount,
    transparentPixelCount,
    acceptedPixelCount,
    seeThroughPixelCount,
  }

  if (acceptedPixelCount === 0)
    return { environment: ambientLightNeutralEnvironment, diagnostics }

  // A full cell holds the sum of scale x scale pixels. Dividing brings the
  // weight back to the 0 to 1 range that the support floor expects.
  const pixelsPerCell = grid.scale * grid.scale
  for (let index = 0; index < field.length; index += 1)
    field[index] /= pixelsPerCell

  const windowHeightCells = Math.max(1, region.exclude.height * frame.height / grid.scale)
  const scratchA = new Float32Array(field.length)
  const scratchB = new Float32Array(field.length)
  const contact = readMapTexels(
    blurField(field, scratchA, scratchB, grid.width, grid.height, contactSigmaWindowHeights * windowHeightCells),
    grid,
    frame,
    region.exclude,
  )
  const surround = readMapTexels(
    blurField(field, scratchA, scratchB, grid.width, grid.height, surroundSigmaWindowHeights * windowHeightCells),
    grid,
    frame,
    region.exclude,
  )

  return {
    environment: buildEnvironment(surround, contact) ?? ambientLightNeutralEnvironment,
    diagnostics,
  }
}

/**
 * Part of the frame that the measurement reads, and the coarser grid it is
 * summed onto.
 *
 * The frame covers the whole display, but the maps cover the window plus its
 * margin, and a pixel can reach a map texel only through the blur. Everything
 * farther than the margin plus three surround deviations from the window has no
 * measurable effect and is not read. Inside that region the pixels are summed
 * onto cells of `scale` x `scale` pixels, chosen so that the window spans about
 * {@link workingWindowHeight} cells: the maps hold half that density, so the
 * cells lose nothing the maps can show, and the blur cost follows the window
 * size instead of the display size.
 */
interface WorkingGrid {
  /** Frame pixel bounds of the region, left and top inclusive, right and bottom exclusive. */
  left: number
  top: number
  right: number
  bottom: number
  /** Frame pixels per cell along each axis. */
  scale: number
  /** Cells per row and rows. */
  width: number
  height: number
}

function workingGridFor(frame: PixelFrame, windowRectangle: NormalizedRectangle): WorkingGrid {
  const windowHeightPixels = Math.max(1, windowRectangle.height * frame.height)
  const scale = Math.max(1, Math.round(windowHeightPixels / workingWindowHeight))
  const reach = ambientLightMapMargin + 3 * surroundSigmaWindowHeights

  const left = clamp(Math.floor((windowRectangle.x - reach * windowRectangle.width) * frame.width), 0, frame.width)
  const top = clamp(Math.floor((windowRectangle.y - reach * windowRectangle.height) * frame.height), 0, frame.height)
  const right = clamp(Math.ceil((windowRectangle.x + (1 + reach) * windowRectangle.width) * frame.width), left, frame.width)
  const bottom = clamp(Math.ceil((windowRectangle.y + (1 + reach) * windowRectangle.height) * frame.height), top, frame.height)

  return {
    left,
    top,
    right,
    bottom,
    scale,
    width: Math.max(1, Math.ceil((right - left) / scale)),
    height: Math.max(1, Math.ceil((bottom - top) / scale)),
  }
}

/**
 * The forced-color source has no screen measurement behind it. Both maps carry
 * the chosen color, so that the mode drives the same shader path as a real
 * capture, including the light wrap and the backlight.
 */
export function uniformAmbientLightEnvironment(
  sample: AmbientLightSample,
): AmbientLightEnvironment {
  const linear: [number, number, number] = [
    srgbToLinear(sample.red),
    srgbToLinear(sample.green),
    srgbToLinear(sample.blue),
  ]

  return {
    // The sample luminance is linear, and the exposure travels perceptually.
    exposure: clamp(linearToSrgb(sample.luminance), 0, 1),
    surround: createAmbientLightMap(linear),
    contact: createAmbientLightMap(linear),
    // The forced color stands in for the whole screen, behind the character
    // included, so this mode exercises the backlight path too.
    behindLuminance: sample.luminance,
  }
}

/**
 * Smooths the exposure and every map texel with one time constant.
 *
 * The result holds new map buffers. The filter uploads a map only when the
 * environment object changes and a consumer can still hold the previous
 * environment, so neither input may be written into.
 */
export function smoothAmbientLightEnvironment(
  previous: AmbientLightEnvironment,
  next: AmbientLightEnvironment,
  elapsedMs: number,
  responseMs: number,
): AmbientLightEnvironment {
  // The step follows elapsed time, so the result does not depend on the rate at
  // which captures arrive.
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / Math.max(1, responseMs))

  return {
    exposure: mix(previous.exposure, next.exposure, alpha),
    surround: smoothMap(previous.surround, next.surround, alpha),
    contact: smoothMap(previous.contact, next.contact, alpha),
    behindLuminance: mix(previous.behindLuminance, next.behindLuminance, alpha),
  }
}

/**
 * Converts a six-digit or eight-digit hex color into an ambient-light sample.
 *
 * @example
 * ambientLightSampleFromHex('#8040c0')
 * // => { red: 0.502, green: 0.251, blue: 0.753, luminance: 0.121 }
 */
export function ambientLightSampleFromHex(color: string): AmbientLightSample | undefined {
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

/**
 * Turns the two blurred fields into the environment that the shader consumes.
 *
 * Precedence for a texel that rests on too little weight, most specific first:
 *
 * 1. A contact texel takes the surround texel at the same position. This is the
 *    common case: deep inside a large model the narrow blur sees nothing but
 *    painted pixels, while the wide blur still reaches the screen around it.
 * 2. A surround texel takes the mean of the supported surround texels. This
 *    happens where the map reaches past the display edge. A black fallback
 *    would darken the silhouette on a side that simply has no screen behind it.
 * 3. When no surround texel has support, the whole map covers painted pixels or
 *    lies off the display. The caller then keeps the neutral environment, which
 *    is what `undefined` reports.
 */
function buildEnvironment(
  surround: ResampledField,
  contact: ResampledField,
): AmbientLightEnvironment | undefined {
  const texelCount = ambientLightMapSize * ambientLightMapSize
  let meanRed = 0
  let meanGreen = 0
  let meanBlue = 0
  let supportedCount = 0
  for (let texel = 0; texel < texelCount; texel += 1) {
    if (surround.support[texel] < mapSupportFloor)
      continue

    meanRed += surround.colors[texel * 3]
    meanGreen += surround.colors[texel * 3 + 1]
    meanBlue += surround.colors[texel * 3 + 2]
    supportedCount += 1
  }

  if (supportedCount === 0)
    return undefined

  meanRed /= supportedCount
  meanGreen /= supportedCount
  meanBlue /= supportedCount

  const surroundMap = createAmbientLightMap()
  const contactMap = createAmbientLightMap()
  for (let texel = 0; texel < texelCount; texel += 1) {
    const offset = texel * 3
    if (surround.support[texel] >= mapSupportFloor) {
      surroundMap.data[offset] = surround.colors[offset]
      surroundMap.data[offset + 1] = surround.colors[offset + 1]
      surroundMap.data[offset + 2] = surround.colors[offset + 2]
    }
    else {
      surroundMap.data[offset] = meanRed
      surroundMap.data[offset + 1] = meanGreen
      surroundMap.data[offset + 2] = meanBlue
    }

    if (contact.support[texel] >= mapSupportFloor) {
      contactMap.data[offset] = contact.colors[offset]
      contactMap.data[offset + 1] = contact.colors[offset + 1]
      contactMap.data[offset + 2] = contact.colors[offset + 2]
    }
    else {
      contactMap.data[offset] = surroundMap.data[offset]
      contactMap.data[offset + 1] = surroundMap.data[offset + 1]
      contactMap.data[offset + 2] = surroundMap.data[offset + 2]
    }
  }

  const [surroundRed, surroundGreen, surroundBlue] = averageAmbientLightMap(surroundMap)

  return {
    // The mean luminance is linear. The exposure drives a brightness control
    // that a person tunes by eye, so it travels in the perceptual encoding.
    exposure: clamp(linearToSrgb(relativeLuminance(surroundRed, surroundGreen, surroundBlue)), 0, 1),
    surround: surroundMap,
    contact: contactMap,
    behindLuminance: ambientLightMapInteriorLuminance(contactMap),
  }
}

/**
 * Blurs the weighted color and the weight with a Gaussian of `sigma` pixels.
 *
 * Three box passes per axis approximate a Gaussian, and a running sum makes one
 * pass cost the same per pixel whatever the radius is. Taps that fall off the
 * frame are dropped rather than repeated, and every pass divides by the number
 * of taps it read. Color and weight therefore carry the same per-pixel weights,
 * and their ratio stays a mean of the pixels that were measured.
 *
 * The result is one of the two scratch buffers, or `source` when the radius
 * rounds to zero. Neither scratch buffer survives the next call.
 */
function blurField(
  source: Float32Array,
  scratchA: Float32Array,
  scratchB: Float32Array,
  width: number,
  height: number,
  sigma: number,
): Float32Array {
  // Three boxes of odd width b have variance 3 * (b * b - 1) / 12, so the width
  // that matches a target deviation is sqrt(1 + 4 * sigma * sigma).
  const radius = Math.round((Math.sqrt(1 + 4 * sigma * sigma) - 1) / 2)
  if (radius <= 0)
    return source

  blurAlongRows(source, scratchA, width, height, radius)
  blurAlongRows(scratchA, scratchB, width, height, radius)
  blurAlongRows(scratchB, scratchA, width, height, radius)
  blurAlongColumns(scratchA, scratchB, width, height, radius)
  blurAlongColumns(scratchB, scratchA, width, height, radius)
  blurAlongColumns(scratchA, scratchB, width, height, radius)

  return scratchB
}

function blurAlongRows(
  source: Float32Array,
  target: Float32Array,
  width: number,
  height: number,
  radius: number,
) {
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let red = 0
    let green = 0
    let blue = 0
    let weight = 0
    const initialTaps = Math.min(radius, width - 1)
    for (let x = 0; x <= initialTaps; x += 1) {
      const offset = (row + x) * 4
      red += source[offset]
      green += source[offset + 1]
      blue += source[offset + 2]
      weight += source[offset + 3]
    }

    for (let x = 0; x < width; x += 1) {
      const divisor = Math.min(width - 1, x + radius) - Math.max(0, x - radius) + 1
      const offset = (row + x) * 4
      target[offset] = red / divisor
      target[offset + 1] = green / divisor
      target[offset + 2] = blue / divisor
      target[offset + 3] = weight / divisor

      const entering = x + 1 + radius
      if (entering < width) {
        const enteringOffset = (row + entering) * 4
        red += source[enteringOffset]
        green += source[enteringOffset + 1]
        blue += source[enteringOffset + 2]
        weight += source[enteringOffset + 3]
      }
      const leaving = x - radius
      if (leaving >= 0) {
        const leavingOffset = (row + leaving) * 4
        red -= source[leavingOffset]
        green -= source[leavingOffset + 1]
        blue -= source[leavingOffset + 2]
        weight -= source[leavingOffset + 3]
      }
    }
  }
}

function blurAlongColumns(
  source: Float32Array,
  target: Float32Array,
  width: number,
  height: number,
  radius: number,
) {
  for (let x = 0; x < width; x += 1) {
    let red = 0
    let green = 0
    let blue = 0
    let weight = 0
    const initialTaps = Math.min(radius, height - 1)
    for (let y = 0; y <= initialTaps; y += 1) {
      const offset = (y * width + x) * 4
      red += source[offset]
      green += source[offset + 1]
      blue += source[offset + 2]
      weight += source[offset + 3]
    }

    for (let y = 0; y < height; y += 1) {
      const divisor = Math.min(height - 1, y + radius) - Math.max(0, y - radius) + 1
      const offset = (y * width + x) * 4
      target[offset] = red / divisor
      target[offset + 1] = green / divisor
      target[offset + 2] = blue / divisor
      target[offset + 3] = weight / divisor

      const entering = y + 1 + radius
      if (entering < height) {
        const enteringOffset = (entering * width + x) * 4
        red += source[enteringOffset]
        green += source[enteringOffset + 1]
        blue += source[enteringOffset + 2]
        weight += source[enteringOffset + 3]
      }
      const leaving = y - radius
      if (leaving >= 0) {
        const leavingOffset = (leaving * width + x) * 4
        red -= source[leavingOffset]
        green -= source[leavingOffset + 1]
        blue -= source[leavingOffset + 2]
        weight -= source[leavingOffset + 3]
      }
    }
  }
}

/**
 * The map covers the window grown by {@link ambientLightMapMargin} on
 * each side. A texel whose center lies off the display reports no support, so
 * that the fallback chain fills it instead of the repeated border color. Light
 * that was never captured must not decide a color.
 */
function readMapTexels(
  field: Float32Array,
  grid: WorkingGrid,
  frame: PixelFrame,
  windowRectangle: NormalizedRectangle,
): ResampledField {
  const texelCount = ambientLightMapSize * ambientLightMapSize
  const colors = new Float32Array(texelCount * 3)
  const support = new Float32Array(texelCount)
  const originX = windowRectangle.x - ambientLightMapMargin * windowRectangle.width
  const originY = windowRectangle.y - ambientLightMapMargin * windowRectangle.height
  const spanX = windowRectangle.width * (1 + 2 * ambientLightMapMargin)
  const spanY = windowRectangle.height * (1 + 2 * ambientLightMapMargin)

  for (let row = 0; row < ambientLightMapSize; row += 1) {
    const normalizedY = originY + ((row + 0.5) / ambientLightMapSize) * spanY
    for (let column = 0; column < ambientLightMapSize; column += 1) {
      const normalizedX = originX + ((column + 0.5) / ambientLightMapSize) * spanX
      if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1)
        continue

      // Cell centers sit at integer coordinates on the grid, so the half-cell
      // shift turns a frame position into a position on that grid.
      const sampleX = (normalizedX * frame.width - grid.left) / grid.scale - 0.5
      const sampleY = (normalizedY * frame.height - grid.top) / grid.scale - 0.5
      const leftColumn = clamp(Math.floor(sampleX), 0, grid.width - 1)
      const topRow = clamp(Math.floor(sampleY), 0, grid.height - 1)
      const rightColumn = Math.min(grid.width - 1, leftColumn + 1)
      const bottomRow = Math.min(grid.height - 1, topRow + 1)
      const fractionX = clamp(sampleX - leftColumn, 0, 1)
      const fractionY = clamp(sampleY - topRow, 0, 1)
      const corners: [number, number, number, number] = [
        (topRow * grid.width + leftColumn) * 4,
        (topRow * grid.width + rightColumn) * 4,
        (bottomRow * grid.width + leftColumn) * 4,
        (bottomRow * grid.width + rightColumn) * 4,
      ]

      const texel = row * ambientLightMapSize + column
      const weight = bilinear(field, corners, 3, fractionX, fractionY)
      support[texel] = weight
      if (weight < mapSupportFloor)
        continue

      for (let channel = 0; channel < 3; channel += 1)
        colors[texel * 3 + channel] = bilinear(field, corners, channel, fractionX, fractionY) / weight
    }
  }

  return { colors, support }
}

/** Reads one channel of a four-channel field between four pixel offsets. */
function bilinear(
  field: Float32Array,
  corners: readonly [number, number, number, number],
  channel: number,
  fractionX: number,
  fractionY: number,
) {
  const top = mix(field[corners[0] + channel], field[corners[1] + channel], fractionX)
  const bottom = mix(field[corners[2] + channel], field[corners[3] + channel], fractionX)
  return mix(top, bottom, fractionY)
}

function smoothMap(
  previous: AmbientLightMap,
  next: AmbientLightMap,
  alpha: number,
): AmbientLightMap {
  const data = new Float32Array(next.data.length)
  for (let index = 0; index < data.length; index += 1)
    data[index] = mix(previous.data[index], next.data[index], alpha)

  return { width: next.width, height: next.height, data }
}

function relativeLuminance(red: number, green: number, blue: number) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
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
