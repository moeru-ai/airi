import type {
  AmbientLightEnvironment,
  AmbientLightFilterOptions,
  AmbientLightMap,
  ScreenAmbientLightMode,
} from '@proj-airi/stage-shared/screen-ambient-light'

import { Application } from '@pixi/app'
import { BatchRenderer, Renderer, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import {
  ambientLightDefaults,
  ambientLightMapSize,
  ambientLightNeutralEnvironment,
  createAmbientLightMap,
} from '@proj-airi/stage-shared/screen-ambient-light'
import { afterAll, describe, expect, it } from 'vitest'

import { ScreenAmbientLightFilter } from './screen-ambient-light'

extensions.add(BatchRenderer, TickerPlugin)

/** Light colors in linear RGB, which is what a light map holds. */
const black: LinearColor = [0, 0, 0]
const white: LinearColor = [1, 1, 1]
const red: LinearColor = [1, 0, 0]
const blue: LinearColor = [0, 0, 1]
/** A warm light whose unit-luminance cast stays under the channel gain cap. */
const warm: LinearColor = [1, 0.7, 0.4]

type LinearColor = [number, number, number]

describe('screen ambient light filter', () => {
  it('leaves the model unchanged at strength zero', () => {
    const pixels = renderLight({
      environment: environmentWith({ surround: uniformMap(red), contact: uniformMap(red), exposure: 1 }),
      strength: 0,
    })

    expect(redAt(pixels, 50)).toBe(64)
    expect(greenAt(pixels, 50)).toBe(64)
  })

  it('does not tint or darken the model under a black environment', () => {
    // ROOT CAUSE:
    //
    // The cast divides the light by its luminance to reach unit luminance.
    // Black has no luminance, so the division is undefined and the multiply
    // would carry a NaN into every channel of the fragment.
    //
    // We fixed this by returning white below a luminance of 0.0005, and the
    // presence fade reaches zero at black as well, so a black environment
    // contributes no tint. Only the exposure term may dim the model, and this
    // case closes it.
    const pixels = renderLight({
      environment: environmentWith({ surround: uniformMap(black), contact: uniformMap(black), exposure: 0 }),
      filterOptions: { baseBrightness: 1, baseContrast: 1, exposureRange: 0, chroma: 1 },
    })

    expect(redAt(pixels, 50)).toBeCloseTo(64, 0)
    expect(blueAt(pixels, 50)).toBeCloseTo(64, 0)
  })

  it('follows the measured screen level when the exposure range is open', () => {
    // ROOT CAUSE:
    //
    // A model that holds one brightness over a black desktop and over a white
    // one reads as a sticker on the screen. The exposure term must follow the
    // measured level whenever the range is open.
    const exposureOptions = { baseBrightness: 0.5, exposureRange: 0.5, chroma: 0 }
    const overDarkScreen = renderLight({
      environment: environmentWith({ exposure: 0 }),
      filterOptions: exposureOptions,
      sourceValue: 200,
    })
    const overBrightScreen = renderLight({
      environment: environmentWith({ exposure: 1 }),
      filterOptions: exposureOptions,
      sourceValue: 200,
    })

    expect(redAt(overBrightScreen, 50)).toBeGreaterThan(redAt(overDarkScreen, 50) + 20)
  })

  it('darkens the model as the screen brightens when the exposure range is negative', () => {
    // ROOT CAUSE:
    //
    // A base that only rises with the screen level is brightest exactly where
    // the added light is brightest, so the model sat near one brightness and
    // the wrap had nothing to read against. Lowering baseBrightness to make
    // the wrap visible then left the model dark over a black desktop, which is
    // the case that needs it least.
    //
    // The range carries a sign, so the base can move the other way: the unlit
    // side darkens only as the screen brightens, and the light that arrives
    // with it lands on the lit side. This is the shipped default.
    const adaptiveOptions = { baseBrightness: 1, exposureRange: -0.3, chroma: 0 }
    const overDarkScreen = renderLight({
      environment: environmentWith({ exposure: 0 }),
      filterOptions: adaptiveOptions,
      sourceValue: 200,
    })
    const overBrightScreen = renderLight({
      environment: environmentWith({ exposure: 1 }),
      filterOptions: adaptiveOptions,
      sourceValue: 200,
    })

    expect(redAt(overBrightScreen, 50)).toBeLessThan(redAt(overDarkScreen, 50) - 10)
    // A black desktop must leave the base alone, which is what keeps the model
    // from going dark exactly where no light can compensate.
    const unmodified = renderLight({
      environment: environmentWith({ exposure: 0 }),
      filterOptions: { baseBrightness: 1, exposureRange: 0, chroma: 0 },
      sourceValue: 200,
    })
    expect(redAt(overDarkScreen, 50)).toBe(redAt(unmodified, 50))
  })

  it('holds one exposure when the exposure range is closed', () => {
    const fixedOptions = { baseBrightness: 0.7, exposureRange: 0, chroma: 0 }
    const overDarkScreen = renderLight({
      environment: environmentWith({ exposure: 0 }),
      filterOptions: fixedOptions,
      sourceValue: 200,
    })
    const overBrightScreen = renderLight({
      environment: environmentWith({ exposure: 1 }),
      filterOptions: fixedOptions,
      sourceValue: 200,
    })

    expect(redAt(overBrightScreen, 50)).toBe(redAt(overDarkScreen, 50))
  })

  it('casts the surround color of each position onto the model at that position', () => {
    // ROOT CAUSE:
    //
    // Two parts of the model on the same side but at different heights share a
    // direction from the model center. A lookup by direction therefore gives
    // them one color, and a red window beside the head also reddens the
    // lower-left sleeve. The cast reads the map by screen position instead, so
    // each column takes the color of the screen behind that column.
    const pixels = renderLight({
      environment: environmentWith({ surround: splitMap(red, blue) }),
      filterOptions: { chroma: 1, baseBrightness: 1, baseContrast: 1, exposureRange: 0 },
      sourceValue: 128,
    })

    expect(redAt(pixels, 5)).toBeGreaterThan(blueAt(pixels, 5) + 20)
    expect(blueAt(pixels, 95)).toBeGreaterThan(redAt(pixels, 95) + 20)
    // The middle column falls between the two texels that meet there, so it
    // reads a mix of both and sits between the two ends.
    expect(redAt(pixels, 50)).toBeLessThan(redAt(pixels, 5))
    expect(redAt(pixels, 50)).toBeGreaterThan(redAt(pixels, 95))
  })

  it('scales the cast with the local light level', () => {
    // ROOT CAUSE:
    //
    // The wide blur spreads a faint share of a red window over most of the
    // map. A cast at unit luminance alone would tint every position above the
    // absolute floor equally, so sleeves far below the window would turn as red
    // as the head in front of it. The cast scales with the level at the
    // position against the brightest light in the map. A dim red at 20% sits
    // above the absolute floor, which separates this case from the near-black
    // fade.
    const dimRed: LinearColor = [0.2, 0, 0]
    const pixels = renderLight({
      environment: environmentWith({ surround: splitMap(red, dimRed) }),
      filterOptions: { chroma: 1, baseBrightness: 1, baseContrast: 1, exposureRange: 0 },
      sourceValue: 128,
    })

    const brightSideShift = redAt(pixels, 5) - greenAt(pixels, 5)
    const dimSideShift = redAt(pixels, 95) - greenAt(pixels, 95)
    expect(brightSideShift).toBeGreaterThan(40)
    expect(dimSideShift).toBeGreaterThan(0)
    expect(dimSideShift).toBeLessThan(brightSideShift * 0.35)
  })

  it('keeps the cast uniform in global mode', () => {
    const pixels = renderLight({
      environment: environmentWith({ surround: splitMap(red, blue) }),
      filterOptions: { chroma: 1, baseBrightness: 1, baseContrast: 1, exposureRange: 0 },
      mode: 'global',
      sourceValue: 128,
    })

    expect(redAt(pixels, 5)).toBe(redAt(pixels, 95))
    expect(blueAt(pixels, 5)).toBe(blueAt(pixels, 95))
  })

  it('changes hue without changing luminance when it casts a color', () => {
    // ROOT CAUSE:
    //
    // A cast that adds the light color to the midtones would paint the model
    // and raise its brightness. The cast multiplies by a unit-luminance color
    // instead, which leaves the luminance to the exposure term. A warm light
    // keeps every channel under the gain cap, so this case sees the pure
    // unit-luminance behavior.
    const neutral = renderLight({
      environment: environmentWith({ surround: uniformMap(warm) }),
      filterOptions: { chroma: 0, baseBrightness: 1, baseContrast: 1, exposureRange: 0 },
      sourceValue: 128,
    })
    const tinted = renderLight({
      environment: environmentWith({ surround: uniformMap(warm) }),
      filterOptions: { chroma: 1, baseBrightness: 1, baseContrast: 1, exposureRange: 0 },
      sourceValue: 128,
    })

    expect(redAt(tinted, 50)).toBeGreaterThan(redAt(neutral, 50))
    expect(blueAt(tinted, 50)).toBeLessThan(blueAt(neutral, 50))
    expect(luminanceAt(tinted, 50)).toBeCloseTo(luminanceAt(neutral, 50), 1)
  })

  it('caps the channel gain of a saturated cast', () => {
    // ROOT CAUSE:
    //
    // Unit luminance divides the light by its luminance, and red carries only
    // 0.21 of the luminance weight, so a pure red screen asks for 4.4x on the
    // red channel. Without a cap the channel runs into clipping, which flattens
    // the shading of every bright part. The cast caps each channel at
    // castGainLimit and lets the luminance drop instead, so under pure red at
    // full chroma a 128 gray reaches 1.6x its linear value, which is sRGB 158,
    // and no more.
    const neutral = renderLight({
      environment: environmentWith({ surround: uniformMap(red) }),
      filterOptions: { chroma: 0, baseBrightness: 1, baseContrast: 1, exposureRange: 0 },
      sourceValue: 128,
    })
    const tinted = renderLight({
      environment: environmentWith({ surround: uniformMap(red) }),
      filterOptions: { chroma: 1, baseBrightness: 1, baseContrast: 1, exposureRange: 0 },
      sourceValue: 128,
    })

    expect(redAt(tinted, 50)).toBeGreaterThan(redAt(neutral, 50) + 15)
    expect(redAt(tinted, 50)).toBeLessThanOrEqual(160)
    expect(greenAt(tinted, 50)).toBeLessThan(greenAt(neutral, 50) - 60)
  })

  it('fades the cast out under a nearly black environment', () => {
    // ROOT CAUSE:
    //
    // Dividing the light by its luminance turns a black desktop with a faint
    // purple menu bar into a saturated purple cast. The hue of light that dark
    // comes from window chrome and noise, so the cast fades with the light
    // level. The fade is continuous, so no hard edge forms where one position
    // is a little brighter than another.
    const faintPurple: LinearColor = [0.0039, 0.0016, 0.0072]
    const brightPurple: LinearColor = [0.6038, 0.0732, 1]
    const options = { chroma: 1, baseBrightness: 1, baseContrast: 1, exposureRange: 0 }
    const underFaint = renderLight({
      environment: environmentWith({ surround: uniformMap(faintPurple) }),
      filterOptions: options,
      sourceValue: 128,
    })
    const underBright = renderLight({
      environment: environmentWith({ surround: uniformMap(brightPurple) }),
      filterOptions: options,
      sourceValue: 128,
    })

    expect(Math.abs(blueAt(underFaint, 50) - greenAt(underFaint, 50))).toBeLessThan(6)
    expect(blueAt(underBright, 50)).toBeGreaterThan(greenAt(underBright, 50) + 20)
  })

  it('removes the tint when chroma is zero', () => {
    const pixels = renderLight({
      environment: environmentWith({ surround: uniformMap(red), contact: uniformMap(red) }),
      filterOptions: { chroma: 0, baseBrightness: 1, baseContrast: 1, exposureRange: 0 },
    })

    expect(redAt(pixels, 50)).toBe(greenAt(pixels, 50))
    expect(greenAt(pixels, 50)).toBe(blueAt(pixels, 50))
  })

  it('wraps the contact color of each side onto the matching silhouette edge', () => {
    // Light wrap is the compositing cue that puts the model in the plate. The
    // band must sit inside the silhouette, and each side must take the color
    // that the screen shows on that side.
    const scene = renderWrap(splitMap(blue, red))
    const rightEdgeRed = channelAt(scene, scene.spriteRight - 2, scene.middleRow, 0)
    const leftEdgeRed = channelAt(scene, scene.spriteLeft + 2, scene.middleRow, 0)
    const centerRed = channelAt(scene, scene.centerColumn, scene.middleRow, 0)
    const rightEdgeBlue = channelAt(scene, scene.spriteRight - 2, scene.middleRow, 2)
    const leftEdgeBlue = channelAt(scene, scene.spriteLeft + 2, scene.middleRow, 2)
    const centerBlue = channelAt(scene, scene.centerColumn, scene.middleRow, 2)

    expect(rightEdgeRed).toBeGreaterThan(centerRed + 10)
    expect(leftEdgeBlue).toBeGreaterThan(centerBlue + 10)
    expect(rightEdgeRed).toBeGreaterThan(rightEdgeBlue)
    expect(leftEdgeBlue).toBeGreaterThan(leftEdgeRed)
  })

  it('darkens the interior and lights the whole edge when light comes from behind', () => {
    // Light beside the character lights one side. Light from directly behind is
    // axial, and a subject in front of it reads as a silhouette. The contact
    // map carries that light, because it covers the window interior too.
    const lit = renderWrap(uniformMap(white), { behindLuminance: 1, backlight: 1, wrapIntensity: 0 })
    const unlit = renderWrap(uniformMap(black), { behindLuminance: 0, backlight: 1, wrapIntensity: 0 })

    const interior = channelAt(lit, lit.centerColumn, lit.middleRow, 0)
    const interiorUnlit = channelAt(unlit, unlit.centerColumn, unlit.middleRow, 0)
    const leftEdge = channelAt(lit, lit.spriteLeft + 2, lit.middleRow, 0)
    const rightEdge = channelAt(lit, lit.spriteRight - 2, lit.middleRow, 0)

    expect(interior).toBeLessThan(interiorUnlit - 10)
    expect(leftEdge).toBeGreaterThan(interior + 20)
    expect(rightEdge).toBeGreaterThan(interior + 20)
    // A backlight of one level has no side, so both edges gain the same amount.
    expect(Math.abs(leftEdge - rightEdge)).toBeLessThan(8)
  })

  it('lights only the edge that has bright content behind it', () => {
    // ROOT CAUSE:
    //
    // One color and one level for the whole window would light the rim of the
    // feet from a bright window behind the head. The rim reads the contact map
    // at the position of the fragment instead.
    const scene = renderWrap(splitMap(black, white), { behindLuminance: 0.5, backlight: 1, wrapIntensity: 0 })
    const darkEdge = channelAt(scene, scene.spriteLeft + 2, scene.middleRow, 0)
    const brightEdge = channelAt(scene, scene.spriteRight - 2, scene.middleRow, 0)
    const interior = channelAt(scene, scene.centerColumn, scene.middleRow, 0)

    expect(brightEdge).toBeGreaterThan(interior + 20)
    expect(darkEdge).toBeLessThan(interior + 2)
  })

  it('fades the backlit edge into the interior without steps', () => {
    // ROOT CAUSE:
    //
    // Alpha is a step at the silhouette. A band built from a fixed set of alpha
    // taps therefore moves by one tap each time a tap crosses the edge, and it
    // falls into the interior as a staircase: a plateau, a drop, a plateau.
    // Under a white backlight every tread reads as one more outline drawn
    // parallel to the sleeve or strand it follows. A separable Gaussian blur of
    // the alpha is continuous in the distance to the edge, so each pixel is at
    // most a little darker than the one before it.
    const lit = renderWrap(uniformMap(white), { behindLuminance: 1, backlight: 1, wrapIntensity: 0 })
    const interior = channelAt(lit, lit.centerColumn, lit.middleRow, 0)
    const profile = Array.from(
      { length: 24 },
      (_, depth) => channelAt(lit, lit.spriteLeft + depth, lit.middleRow, 0),
    )

    expect(profile[1]).toBeGreaterThan(interior + 40)
    const drops = profile.slice(0, -1).map((value, depth) => value - profile[depth + 1])
    for (const [depth, drop] of drops.entries())
      expect(drop, `depth ${depth}`).toBeGreaterThanOrEqual(0)

    // The band must decay into the interior instead of ending on a step. The
    // ring taps ended it with a drop of 27 levels in this scene.
    const bandEnd = profile.findIndex((value, depth) => depth > 0 && value <= interior + 1)
    expect(bandEnd).toBeGreaterThan(4)
    expect(drops[bandEnd - 1], 'last drop').toBeLessThanOrEqual(5)
    expect(drops[bandEnd - 2], 'second to last drop').toBeLessThanOrEqual(10)

    // A plateau followed by a drop is a tread. Inside the band the value must
    // keep falling, and once it levels off it must stay level.
    for (let depth = 1; depth < drops.length - 1; depth += 1) {
      if (drops[depth] === 0)
        expect(drops[depth + 1], `plateau at depth ${depth}`).toBeLessThanOrEqual(2)
    }
  })

  it('does nothing when nothing bright sits behind the character', () => {
    const withAmount = renderWrap(uniformMap(black), { behindLuminance: 0, backlight: 2, wrapIntensity: 0 })
    const without = renderWrap(uniformMap(black), { behindLuminance: 0, backlight: 0, wrapIntensity: 0 })

    expect(channelAt(withAmount, withAmount.centerColumn, withAmount.middleRow, 0))
      .toBe(channelAt(without, without.centerColumn, without.middleRow, 0))
  })

  it('wraps a translucent part less when the translucent-wrap option is on', () => {
    // A part drawn with partial alpha already shows the desktop through
    // itself, and the wrap adds that desktop color on top. The option squares
    // the alpha in the band masks, so a half-transparent part receives half
    // the wrap it received before, while an opaque part is unchanged.
    const halfOff = renderWrap(uniformMap(white), { spriteAlpha: 0.5 })
    const halfOn = renderWrap(uniformMap(white), { spriteAlpha: 0.5, translucentWrap: true })
    const opaqueOff = renderWrap(uniformMap(white))
    const opaqueOn = renderWrap(uniformMap(white), { translucentWrap: true })

    const halfEdgeOff = channelAt(halfOff, halfOff.spriteLeft + 1, halfOff.middleRow, 0)
    const halfEdgeOn = channelAt(halfOn, halfOn.spriteLeft + 1, halfOn.middleRow, 0)
    expect(halfEdgeOn).toBeLessThan(halfEdgeOff - 8)
    expect(channelAt(opaqueOn, opaqueOn.spriteLeft + 1, opaqueOn.middleRow, 0))
      .toBe(channelAt(opaqueOff, opaqueOff.spriteLeft + 1, opaqueOff.middleRow, 0))
  })

  it('leaves the model interior untouched by the light wrap', () => {
    // ROOT CAUSE:
    //
    // A wrap that reaches the interior is an overlay, not a wrap. The mask
    // multiplies the model alpha by one minus the blurred alpha, so it must
    // vanish once every tap lands inside the silhouette.
    const wrapped = renderWrap(uniformMap(white))
    const unwrapped = renderWrap(uniformMap(black))

    expect(channelAt(wrapped, wrapped.centerColumn, wrapped.middleRow, 0))
      .toBe(channelAt(unwrapped, unwrapped.centerColumn, unwrapped.middleRow, 0))
  })
})

afterAll(() => document.querySelectorAll('canvas[data-ambient-light-test]').forEach(canvas => canvas.remove()))

/**
 * Renders a 100 x 1 gray strip through the filter and returns its pixels.
 *
 * The strip fills the whole canvas, so no light wrap can appear. The wrap has
 * its own scene in `renderWrap`. Every option starts at the shipped default,
 * and the exposure range starts closed so the cast cases isolate the cast.
 *
 * The canvas is the stage, so a canvas column maps straight onto a map column:
 * column 0 sits at window uv 0 and column 99 at window uv 1.
 */
function renderLight({
  environment,
  filterOptions,
  mode = 'window-gradient',
  sourceValue = 64,
  strength = 1,
}: {
  environment: AmbientLightEnvironment
  filterOptions?: Partial<AmbientLightFilterOptions>
  mode?: ScreenAmbientLightMode
  sourceValue?: number
  strength?: number
}) {
  const source = document.createElement('canvas')
  source.width = 100
  source.height = 1
  const sourceContext = source.getContext('2d')!
  sourceContext.fillStyle = `rgb(${sourceValue}, ${sourceValue}, ${sourceValue})`
  sourceContext.fillRect(0, 0, source.width, source.height)

  const app = new Application({
    width: source.width,
    height: source.height,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
  })
  app.view.dataset.ambientLightTest = ''
  document.body.appendChild(app.view)

  const sprite = new Sprite(Texture.from(source))
  const filter = new ScreenAmbientLightFilter()
  filter.update({
    environment,
    mode,
    strength,
    options: {
      ...ambientLightDefaults.filter,
      wrapIntensity: 0,
      backlight: 0,
      ...filterOptions,
    },
  })
  sprite.filters = [filter]
  app.stage.addChild(sprite)
  app.render()

  const pixels = new Uint8Array(source.width * source.height * 4)
  if (!(app.renderer instanceof Renderer))
    throw new TypeError('The ambient-light shader test requires a WebGL renderer')

  const gl = app.renderer.gl
  gl.readPixels(0, 0, source.width, source.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

  app.destroy(true, { children: true, texture: true, baseTexture: true })
  return pixels
}

function redAt(pixels: Uint8Array, x: number) {
  return pixels[x * 4]
}

function greenAt(pixels: Uint8Array, x: number) {
  return pixels[x * 4 + 1]
}

function blueAt(pixels: Uint8Array, x: number) {
  return pixels[x * 4 + 2]
}

/** Relative luminance of one pixel in linear light, from 0 to 1. */
function luminanceAt(pixels: Uint8Array, x: number) {
  const linear = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(redAt(pixels, x)) + 0.7152 * linear(greenAt(pixels, x)) + 0.0722 * linear(blueAt(pixels, x))
}

interface WrapScene {
  pixels: Uint8Array
  width: number
  /** First and last column that the model covers. */
  spriteLeft: number
  spriteRight: number
  middleRow: number
  centerColumn: number
}

/**
 * Renders a gray square that is smaller than the canvas, so the light wrap has
 * transparent margin to read. The cast is disabled so the wrap stands alone.
 */
function renderWrap(
  contact: AmbientLightMap,
  behind: {
    behindLuminance?: number
    backlight?: number
    wrapIntensity?: number
    translucentWrap?: boolean
    /** Alpha of the gray sprite, from 0 to 1. The default is opaque. */
    spriteAlpha?: number
  } = {},
): WrapScene {
  const canvasSize = 100
  const spriteSize = 60
  const spriteOffset = (canvasSize - spriteSize) / 2

  const source = document.createElement('canvas')
  source.width = spriteSize
  source.height = spriteSize
  const sourceContext = source.getContext('2d')!
  sourceContext.fillStyle = `rgba(64, 64, 64, ${behind.spriteAlpha ?? 1})`
  sourceContext.fillRect(0, 0, spriteSize, spriteSize)

  const app = new Application({
    width: canvasSize,
    height: canvasSize,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
  })
  app.view.dataset.ambientLightTest = ''
  document.body.appendChild(app.view)

  const sprite = new Sprite(Texture.from(source))
  sprite.position.set(spriteOffset, spriteOffset)
  const filter = new ScreenAmbientLightFilter()
  filter.update({
    environment: environmentWith({ contact, behindLuminance: behind.behindLuminance ?? 0 }),
    mode: 'window-gradient',
    strength: 1,
    options: {
      ...ambientLightDefaults.filter,
      baseBrightness: 1,
      baseContrast: 1,
      exposureRange: 0,
      chroma: 0,
      // Pinned so that a change to the shipped default cannot move the band out
      // of the pixels these cases read.
      wrapIntensity: behind.wrapIntensity ?? 0.85,
      wrapDiffuse: 0.07,
      backlight: behind.backlight ?? 0,
      translucentWrap: behind.translucentWrap ?? false,
    },
  })
  sprite.filters = [filter]
  app.stage.addChild(sprite)
  app.render()

  const pixels = new Uint8Array(canvasSize * canvasSize * 4)
  if (!(app.renderer instanceof Renderer))
    throw new TypeError('The ambient-light shader test requires a WebGL renderer')

  const gl = app.renderer.gl
  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  app.destroy(true, { children: true, texture: true, baseTexture: true })

  return {
    pixels,
    width: canvasSize,
    spriteLeft: spriteOffset,
    spriteRight: spriteOffset + spriteSize - 1,
    middleRow: canvasSize / 2,
    centerColumn: canvasSize / 2,
  }
}

function channelAt(scene: WrapScene, x: number, y: number, channel: number) {
  return scene.pixels[(y * scene.width + x) * 4 + channel]
}

function environmentWith(overrides: Partial<AmbientLightEnvironment>): AmbientLightEnvironment {
  return { ...ambientLightNeutralEnvironment, ...overrides }
}

function uniformMap(color: LinearColor): AmbientLightMap {
  return createAmbientLightMap(color)
}

/**
 * Builds a map that shows one color over the left half of the stage window and
 * its margin, and another over the right half.
 *
 * The map columns run left to right across the screen, so column 0 lies half a
 * window width left of the window and the split falls on the window center.
 */
function splitMap(leftColor: LinearColor, rightColor: LinearColor): AmbientLightMap {
  const map = createAmbientLightMap()
  for (let row = 0; row < ambientLightMapSize; row += 1) {
    for (let column = 0; column < ambientLightMapSize; column += 1) {
      const color = column < ambientLightMapSize / 2 ? leftColor : rightColor
      const offset = (row * ambientLightMapSize + column) * 3
      map.data[offset] = color[0]
      map.data[offset + 1] = color[1]
      map.data[offset + 2] = color[2]
    }
  }

  return map
}
