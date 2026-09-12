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
  averageAmbientLightMap,
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
/** A warm light with every channel above zero, so a saturation change moves all three. */
const warm: LinearColor = [1, 0.7, 0.4]
/**
 * A saturated blue of the kind a real page emits. Every channel carries some
 * light, unlike the pure primaries above: the color boost may only trade
 * between channels that the screen actually lit, so a primary leaves it nothing
 * to work with.
 */
const saturatedBlue: LinearColor = [0.05, 0.12, 0.6]

type LinearColor = [number, number, number]

/**
 * Options for the cases that measure the model body.
 *
 * The response curve is straight and the color boost is off, so a case reads
 * the light the shader computed rather than the shaping on top of it. Each case
 * overrides only what it is about.
 */
function bodyOptions(overrides: Partial<AmbientLightFilterOptions> = {}): Partial<AmbientLightFilterOptions> {
  return { darkBase: 0.5, baseCurve: 1, localShare: 1, tint: 1, colorBoost: 0, ...overrides }
}

describe('screen ambient light filter', () => {
  it('leaves the model unchanged at strength zero', () => {
    const pixels = renderLight({
      environment: environmentWith({ surround: uniformMap(red), contact: uniformMap(red), exposure: 1 }),
      filterOptions: bodyOptions({ darkBase: 0 }),
      strength: 0,
    })

    expect(redAt(pixels, 50)).toBe(64)
    expect(greenAt(pixels, 50)).toBe(64)
  })

  it('shows the model as drawn under a white screen', () => {
    // White is the light the painter lit the model with, so full white light
    // reflects every color as drawn. Both bands are off in this scene.
    const pixels = renderLight({
      environment: environmentWith({ surround: uniformMap(white), contact: uniformMap(white), exposure: 1, behindLuminance: 1 }),
      filterOptions: bodyOptions(),
    })

    expect(redAt(pixels, 50)).toBe(64)
    expect(greenAt(pixels, 50)).toBe(64)
    expect(blueAt(pixels, 50)).toBe(64)
  })

  it('dims the model toward the floor as the screen darkens', () => {
    // ROOT CAUSE:
    //
    // The first shader darkened the model as the screen brightened, so a white
    // page turned the character into a silhouette, and the next one held the
    // model at its painted brightness under every screen, so a character in
    // front of a dark screen with one orange window stayed as bright as the
    // painter drew it and the light beside it had nothing to read against.
    //
    // A diffuse subject reflects the light around it. The model now scales
    // with the screen light between the floor, which is the room without the
    // screen, and its painted brightness under white. A black screen therefore
    // shows the model at the floor and never darker.
    const underBlack = renderLight({
      environment: environmentWith({ surround: uniformMap(black) }),
      filterOptions: bodyOptions(),
      sourceValue: 200,
    })
    const untouched = renderLight({
      environment: environmentWith({ surround: uniformMap(black) }),
      filterOptions: bodyOptions({ darkBase: 1 }),
      sourceValue: 200,
    })

    expect(luminanceAt(underBlack, 50)).toBeCloseTo(luminanceAt(untouched, 50) * 0.5, 2)
    expect(redAt(untouched, 50)).toBe(200)
    // Strength beyond one lights the bands more; it must not dim the model
    // further.
    const strong = renderLight({
      environment: environmentWith({ surround: uniformMap(black) }),
      filterOptions: bodyOptions(),
      sourceValue: 200,
      strength: 3,
    })
    expect(redAt(strong, 50)).toBe(redAt(underBlack, 50))
  })

  it('never takes a channel below the floor, whatever color the screen is', () => {
    // ROOT CAUSE:
    //
    // An earlier build added the color part of the light to the reflectance.
    // Under a saturated screen that part is negative in the channels the light
    // lacks, so an orange desktop drove the blue channel of a white jacket to
    // zero and the artwork lost a primary. Light only adds: a channel the
    // screen does not emit falls no lower than the floor, which stands for the
    // room without the screen.
    const floorOnly = renderLight({
      environment: environmentWith({ surround: uniformMap(black) }),
      filterOptions: bodyOptions(),
      sourceValue: 200,
    })

    for (const light of [red, blue, warm]) {
      const pixels = renderLight({
        environment: environmentWith({ surround: uniformMap(light) }),
        filterOptions: bodyOptions(),
        sourceValue: 200,
      })

      expect(redAt(pixels, 50), `red under ${light}`).toBeGreaterThanOrEqual(redAt(floorOnly, 50) - 1)
      expect(greenAt(pixels, 50), `green under ${light}`).toBeGreaterThanOrEqual(greenAt(floorOnly, 50) - 1)
      expect(blueAt(pixels, 50), `blue under ${light}`).toBeGreaterThanOrEqual(blueAt(floorOnly, 50) - 1)
    }
  })

  it('reflects the screen color at the brightness that color gives', () => {
    // A blue screen lights the blue channel fully and leaves red and green near
    // the floor, so the model turns blue without turning brighter.
    const underBlue = renderLight({
      environment: environmentWith({ surround: uniformMap(blue) }),
      filterOptions: bodyOptions(),
    })
    const underRed = renderLight({
      environment: environmentWith({ surround: uniformMap(red) }),
      filterOptions: bodyOptions(),
    })

    expect(blueAt(underBlue, 50)).toBeGreaterThan(redAt(underBlue, 50) + 10)
    expect(redAt(underRed, 50)).toBeGreaterThan(blueAt(underRed, 50) + 10)
  })

  it('holds the model at one brightness while its window moves', () => {
    // ROOT CAUSE:
    //
    // The exposure used to come from the light map, which covers the window and
    // a margin. Dragging the window onto a dark part of the desktop therefore
    // dimmed the whole character even though the room had not changed. The
    // level now comes from the display meter, and the map only shapes it, so at
    // a local share of zero the character keeps one brightness wherever it sits.
    const steady = bodyOptions({ localShare: 0 })
    const overBright = renderLight({
      environment: environmentWith({ surround: uniformMap(white), displayLuminance: 0.3 }),
      filterOptions: steady,
      sourceValue: 200,
    })
    const overDark = renderLight({
      environment: environmentWith({ surround: uniformMap(black), displayLuminance: 0.3 }),
      filterOptions: steady,
      sourceValue: 200,
    })

    expect(redAt(overBright, 50)).toBe(redAt(overDark, 50))

    // At a positive share the same two scenes must separate again.
    const local = bodyOptions({ localShare: 1 })
    const localBright = renderLight({
      environment: environmentWith({ surround: uniformMap(white), displayLuminance: 0.3 }),
      filterOptions: local,
      sourceValue: 200,
    })
    const localDark = renderLight({
      environment: environmentWith({ surround: uniformMap(black), displayLuminance: 0.3 }),
      filterOptions: local,
      sourceValue: 200,
    })
    expect(redAt(localBright, 50)).toBeGreaterThan(redAt(localDark, 50) + 40)
  })

  it('follows only the screen brightness when the tint is zero', () => {
    const pixels = renderLight({
      environment: environmentWith({ surround: uniformMap(blue) }),
      filterOptions: bodyOptions({ tint: 0 }),
    })

    expect(redAt(pixels, 50)).toBe(greenAt(pixels, 50))
    expect(greenAt(pixels, 50)).toBe(blueAt(pixels, 50))
  })

  it('adds color under dim saturated light without changing its brightness', () => {
    // ROOT CAUSE:
    //
    // Saturated light carries little energy: blue at full strength has 7% of
    // the luminance of white. The physically correct result under a blue screen
    // is therefore almost colorless, which is not what the screen looks like.
    // The boost moves the lit color away from the unlit one in hue while
    // holding its luminance, by an amount that grows as the light dims.
    //
    // The boost works by trading between channels the screen lit, and no
    // channel may end below the unlit model. A pure primary gives two channels
    // no light at all and therefore nothing to trade, so this case uses a
    // saturated blue of the kind a page actually emits.
    const plain = renderLight({
      environment: environmentWith({ surround: uniformMap(saturatedBlue) }),
      filterOptions: bodyOptions({ colorBoost: 0 }),
      sourceValue: 128,
    })
    const boosted = renderLight({
      environment: environmentWith({ surround: uniformMap(saturatedBlue) }),
      filterOptions: bodyOptions({ colorBoost: 8 }),
      sourceValue: 128,
    })

    const saturationOf = (pixels: Uint8Array) => {
      const channels = [redAt(pixels, 50), greenAt(pixels, 50), blueAt(pixels, 50)]
      return (Math.max(...channels) - Math.min(...channels)) / Math.max(...channels, 1)
    }

    expect(saturationOf(boosted)).toBeGreaterThan(saturationOf(plain) + 0.05)
    expect(luminanceAt(boosted, 50)).toBeCloseTo(luminanceAt(plain, 50), 2)
  })

  it('reflects the surround color of each position at that position', () => {
    // ROOT CAUSE:
    //
    // Two parts of the model on the same side but at different heights share a
    // direction from the model center. A lookup by direction therefore gives
    // them one color, and a red window beside the head also reddens the
    // lower-left sleeve. The model reads the map by screen position instead,
    // so each column takes the color of the screen behind that column.
    const pixels = renderLight({
      environment: environmentWith({ surround: splitMap(red, blue) }),
      filterOptions: bodyOptions({ darkBase: 0, localShare: 1 }),
    })

    expect(redAt(pixels, 5)).toBeGreaterThan(blueAt(pixels, 5) + 20)
    expect(blueAt(pixels, 95)).toBeGreaterThan(redAt(pixels, 95) + 20)
    // The middle column falls between the two texels that meet there, so it
    // reads a mix of both and sits between the two ends.
    expect(redAt(pixels, 50)).toBeLessThan(redAt(pixels, 5))
    expect(redAt(pixels, 50)).toBeGreaterThan(redAt(pixels, 95))
  })

  it('keeps the reflected light uniform in global mode', () => {
    const pixels = renderLight({
      environment: environmentWith({ surround: splitMap(red, blue) }),
      filterOptions: bodyOptions({ darkBase: 0, localShare: 1 }),
      mode: 'global',
    })

    expect(redAt(pixels, 5)).toBe(redAt(pixels, 95))
    expect(blueAt(pixels, 5)).toBe(blueAt(pixels, 95))
  })

  it('adds white light when the wrap saturation is zero', () => {
    // The saturation control mixes the light toward its luminance. At zero a
    // red screen still lights the edge, but with a gray of the same luminance.
    const scene = renderWrap(uniformMap(red), { wrapSaturation: 0 })
    const edgeRed = channelAt(scene, scene.spriteLeft + 2, scene.middleRow, 0)
    const edgeGreen = channelAt(scene, scene.spriteLeft + 2, scene.middleRow, 1)
    const edgeBlue = channelAt(scene, scene.spriteLeft + 2, scene.middleRow, 2)

    expect(edgeRed).toBeGreaterThan(channelAt(scene, scene.centerColumn, scene.middleRow, 0) + 10)
    expect(edgeRed).toBe(edgeGreen)
    expect(edgeGreen).toBe(edgeBlue)
  })

  it('keeps the amount of light when the wrap saturation changes', () => {
    // ROOT CAUSE:
    //
    // A saturation control that scaled the channels toward zero would darken
    // the band as it removed the hue. Mixing toward the luminance keeps the
    // luminance, so the control moves only the color of the band.
    const gray = renderWrap(uniformMap(warm), { wrapSaturation: 0 })
    const colored = renderWrap(uniformMap(warm), { wrapSaturation: 1 })
    const column = gray.spriteLeft + 2

    expect(channelAt(colored, column, colored.middleRow, 0)).toBeGreaterThan(channelAt(gray, column, gray.middleRow, 0))
    expect(channelAt(colored, column, colored.middleRow, 2)).toBeLessThan(channelAt(gray, column, gray.middleRow, 2))
    expect(luminanceOf(colored, column, colored.middleRow)).toBeCloseTo(luminanceOf(gray, column, gray.middleRow), 1)
  })

  it('wraps one color in global mode', () => {
    const scene = renderWrap(splitMap(red, blue), { mode: 'global' })

    expect(channelAt(scene, scene.spriteLeft + 2, scene.middleRow, 0)).toBe(channelAt(scene, scene.spriteRight - 2, scene.middleRow, 0))
    expect(channelAt(scene, scene.spriteLeft + 2, scene.middleRow, 2)).toBe(channelAt(scene, scene.spriteRight - 2, scene.middleRow, 2))
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

  it('lights the whole edge and nothing else when light comes from behind', () => {
    // Light beside the character lights one side. Light from directly behind is
    // axial, and a subject in front of it shows a rim all around. The contact
    // map carries that light, because it covers the window interior too.
    const lit = renderWrap(uniformMap(white), { backlight: 1, wrapIntensity: 0 })
    const unlit = renderWrap(uniformMap(black), { backlight: 1, wrapIntensity: 0 })

    const interior = channelAt(lit, lit.centerColumn, lit.middleRow, 0)
    const leftEdge = channelAt(lit, lit.spriteLeft, lit.middleRow, 0)
    const rightEdge = channelAt(lit, lit.spriteRight, lit.middleRow, 0)

    expect(interior).toBe(channelAt(unlit, unlit.centerColumn, unlit.middleRow, 0))
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
    const scene = renderWrap(splitMap(black, white), { backlight: 1, wrapIntensity: 0 })
    const darkEdge = channelAt(scene, scene.spriteLeft, scene.middleRow, 0)
    const brightEdge = channelAt(scene, scene.spriteRight, scene.middleRow, 0)
    const interior = channelAt(scene, scene.centerColumn, scene.middleRow, 0)

    expect(brightEdge).toBeGreaterThan(interior + 20)
    expect(darkEdge).toBeLessThan(interior + 2)
  })

  it('fades the wrapped edge into the interior without steps', () => {
    // ROOT CAUSE:
    //
    // Alpha is a step at the silhouette. A band built from a fixed set of alpha
    // taps therefore moves by one tap each time a tap crosses the edge, and it
    // falls into the interior as a staircase: a plateau, a drop, a plateau.
    // Under a white wrap every tread reads as one more outline drawn parallel
    // to the sleeve or strand it follows. A separable Gaussian blur of the
    // alpha is continuous in the distance to the edge, so each pixel is at most
    // a little darker than the one before it.
    const lit = renderWrap(uniformMap(white))
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
    const withAmount = renderWrap(uniformMap(black), { backlight: 2, wrapIntensity: 0 })
    const without = renderWrap(uniformMap(black), { backlight: 0, wrapIntensity: 0 })

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
 * Both bands start switched off, so the strip shows what the filter does to
 * the model interior. The bands have their own scene in `renderWrap`.
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

/** Relative luminance of one strip pixel in linear light, from 0 to 1. */
function luminanceAt(pixels: Uint8Array, x: number) {
  return relativeLuminance(redAt(pixels, x), greenAt(pixels, x), blueAt(pixels, x))
}

/** Relative luminance of one scene pixel in linear light, from 0 to 1. */
function luminanceOf(scene: WrapScene, x: number, y: number) {
  return relativeLuminance(channelAt(scene, x, y, 0), channelAt(scene, x, y, 1), channelAt(scene, x, y, 2))
}

function relativeLuminance(red: number, green: number, blue: number) {
  const linear = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
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
 * Renders a gray square that is smaller than the canvas, so the bands have
 * transparent margin to read. The reflected light is off so the bands stand
 * alone.
 */
function renderWrap(
  contact: AmbientLightMap,
  behind: {
    mode?: ScreenAmbientLightMode
    backlight?: number
    wrapIntensity?: number
    wrapSaturation?: number
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
    environment: environmentWith({ contact }),
    mode: behind.mode ?? 'window-gradient',
    strength: 1,
    options: {
      ...ambientLightDefaults.filter,
      // The body response and the color boost are off, so the bands stand alone.
      darkBase: 1,
      tint: 0,
      colorBoost: 0,
      // Pinned so that a change to the shipped default cannot move the band out
      // of the pixels these cases read, and cannot take the color out of it.
      wrapIntensity: behind.wrapIntensity ?? 0.85,
      wrapSaturation: behind.wrapSaturation ?? 1,
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

/**
 * An environment whose display meter matches its surround map unless a case
 * sets one of its own. The model takes its exposure from the meter, so a case
 * that changed only the map would still be lit by the neutral full-white
 * display and would measure nothing.
 */
function environmentWith(overrides: Partial<AmbientLightEnvironment>): AmbientLightEnvironment {
  const surround = overrides.surround ?? ambientLightNeutralEnvironment.surround
  const [red, green, blue] = averageAmbientLightMap(surround)
  return {
    ...ambientLightNeutralEnvironment,
    displayLuminance: 0.2126 * red + 0.7152 * green + 0.0722 * blue,
    ...overrides,
  }
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
