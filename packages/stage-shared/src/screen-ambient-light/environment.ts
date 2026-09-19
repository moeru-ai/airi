/** One measured light color. The channels are sRGB, from 0 to 1. */
export interface AmbientLightSample {
  red: number
  green: number
  blue: number
  /** Relative luminance in linear light, not sRGB, from 0 to 1. */
  luminance: number
}

export type ScreenAmbientLightMode = 'window-gradient' | 'global'
export type ScreenAmbientLightSource = 'screen-capture' | 'forced-color'

export interface AmbientLightSamplingOptions {
  /**
   * Weight of a pixel with no saturation, relative to a fully saturated one.
   *
   * A desktop is mostly gray, so a plain mean lands near gray and the character
   * shows no color. A weight below 1 lets colored content count for more.
   *
   * @default 0.35
   */
  neutralColorWeight: number
}

export interface AmbientLightFilterOptions {
  /**
   * Model brightness over a black screen, from 0 to 1.
   *
   * The model reflects the light around it: a white screen shows it as drawn,
   * and a darker screen dims it toward this floor. The floor stands for the
   * light the room gives without the screen, so 1 switches the dimming off.
   *
   * @default 0.45
   */
  darkBase: number
  /**
   * Shape of the response between {@link darkBase} and the painted brightness.
   *
   * The screen level is raised to this power before it lifts the model, so
   * above 1 a half-lit screen leaves the model closer to the floor than to its
   * painted brightness. 1 is a straight line.
   *
   * @default 2
   */
  baseCurve: number
  /**
   * How much of the model's exposure comes from the light beside it rather
   * than from the whole display, from 0 to 1.
   *
   * The display term is one number for the whole model, so dragging the window
   * across the desktop does not swing its brightness. The local term reads the
   * light map at each fragment, so a bright window beside the head lights that
   * side more than the far one. At 0 the model takes one level everywhere; at
   * 1 every fragment follows only what is beside it.
   *
   * @default 0.5
   */
  localShare: number
  /**
   * How much of the screen hue the model takes as the screen lights it.
   *
   * At 1 the model reflects the screen color, so a blue screen turns it blue at
   * the brightness that blue light gives. At 0 only the screen brightness
   * reaches the model and its colors stay its own.
   *
   * @default 1
   */
  tint: number
  /**
   * Extra perceptual color the model takes from dim but saturated light, from
   * 0 to 10.
   *
   * A saturated color carries little light: blue at full strength has 7% of the
   * luminance of white, so light that looks strongly blue moves the model
   * almost not at all. This pushes the color of the lit result further from the
   * unlit one while holding its luminance, by an amount that grows with the
   * saturation of the light and shrinks as the light gets brighter. 0 leaves
   * the physical result alone.
   *
   * @default 4
   */
  colorBoost: number
  /**
   * Strength of the light wrap that bleeds the background color into the model
   * silhouette. This is the compositing cue that makes the model read as part
   * of the screen content behind it.
   *
   * @default 1.7
   */
  wrapIntensity: number
  /**
   * How much of the screen hue the wrapped light keeps.
   *
   * At 0 the band adds the screen luminance as white light. At 1 it adds the
   * screen color. The amount of light is the same at every value, so a
   * saturated screen tints the edge without lighting it more.
   *
   * @default 1
   */
  wrapSaturation: number
  /**
   * Strength of the backlight rim: a thin line of light along the whole
   * silhouette.
   *
   * A subject in front of a bright plate shows a bright edge. The rim follows
   * the contact map at each fragment, so an edge with a dark desktop behind it
   * gains nothing.
   *
   * @default 1.6
   */
  backlight: number
  /**
   * Width of the light wrap band, as a fraction of the model height. It matches
   * the `Diffuse` control of a compositing light-wrap node.
   *
   * The band is a Gaussian blur of the model alpha with a standard deviation of
   * half this width, so the light fades out about one width inside the
   * silhouette and has no inner boundary of its own.
   *
   * @default 0.03
   */
  wrapDiffuse: number
  /**
   * Scales the light wrap and the backlight rim by the square of the model
   * alpha instead of the alpha itself.
   *
   * A part drawn with partial alpha already shows the desktop through itself,
   * and the wrap adds that same color again. At 80% alpha the part then
   * receives 64% of the wrap. An opaque part is unchanged either way.
   *
   * @default false
   */
  translucentWrap: boolean
}

/**
 * Texel columns and rows of a light map.
 *
 * The shader reads between texels, so the grid stays coarse. 24 texels over
 * twice the subject is finer than the blur that produces a map.
 */
export const ambientLightMapSize = 24

/** A rectangle in coordinates where the whole frame spans 0 to 1 on each axis. */
export interface NormalizedRectangle {
  x: number
  y: number
  width: number
  height: number
}

/**
 * How far a light map reaches past the subject on every side, in subject
 * heights.
 *
 * The maps reach past the subject because the light that wraps onto the
 * silhouette comes from beside it. One figure covers both axes because the
 * reach is a distance on screen, not a fraction of each side: a tall subject
 * that reached half its height above and half its width to the left would
 * gather more light from above than from beside, and the mean of the map would
 * report a light that had only moved.
 *
 * The extraction places the texels with {@link ambientLightMapMarginFor} and
 * the shader reads them back with the same pair, so the two disagree about
 * every position if they differ.
 */
export const ambientLightMapMargin = 0.5

/**
 * The whole stage window, which stands in wherever the bounds of what was
 * drawn are unknown.
 *
 * It is frozen and shared because components default to it: a fresh object
 * every time would look like a change to every watcher reading it.
 */
export const wholeWindowRectangle: Readonly<NormalizedRectangle> = Object.freeze({
  x: 0,
  y: 0,
  width: 1,
  height: 1,
})

/**
 * The reach of a light map on each axis, in units of that axis of the window.
 *
 * The two differ whenever the window is not square, and they describe the same
 * distance on screen. Consumers need both: map uv 0 to 1 spans window uv
 * `-x` to `1 + x` across and `-y` to `1 + y` down.
 */
export interface AmbientLightMapMargin {
  x: number
  y: number
}

/**
 * Reach for one subject, from its width divided by its height.
 *
 * @example
 * ambientLightMapMarginFor(430 / 526)
 * // => { x: 0.6116..., y: 0.5 }
 */
export function ambientLightMapMarginFor(subjectAspect: number): AmbientLightMapMargin {
  return { x: ambientLightMapMargin / Math.max(subjectAspect, 0.0001), y: ambientLightMapMargin }
}

/** The reach for a square subject, which is what a map with no measurement behind it assumes. */
export const ambientLightNeutralMapMargin: Readonly<AmbientLightMapMargin> = Object.freeze(
  ambientLightMapMarginFor(1),
)

/** Screen light over the subject and its margin, as a small color grid. */
export interface AmbientLightMap {
  /** Texel columns and rows. Both are {@link ambientLightMapSize}. */
  width: number
  height: number
  /** Linear RGB, row major, three floats per texel. Row 0 is the top. */
  data: Float32Array
}

/** @param fill Linear RGB. Defaults to black, which adds no light. */
export function createAmbientLightMap(fill?: readonly [number, number, number]): AmbientLightMap {
  const data = new Float32Array(ambientLightMapSize * ambientLightMapSize * 3)
  if (fill) {
    for (let texel = 0; texel < ambientLightMapSize * ambientLightMapSize; texel += 1) {
      data[texel * 3] = fill[0]
      data[texel * 3 + 1] = fill[1]
      data[texel * 3 + 2] = fill[2]
    }
  }

  return { width: ambientLightMapSize, height: ambientLightMapSize, data }
}

/**
 * Mean color of a whole map in linear light. Global lighting mode uses it in
 * place of the per-position lookup, so the whole model takes one color.
 */
export function averageAmbientLightMap(map: AmbientLightMap): [number, number, number] {
  const texelCount = map.width * map.height
  if (texelCount === 0)
    return [0, 0, 0]

  let red = 0
  let green = 0
  let blue = 0
  for (let texel = 0; texel < texelCount; texel += 1) {
    red += map.data[texel * 3]
    green += map.data[texel * 3 + 1]
    blue += map.data[texel * 3 + 2]
  }

  return [red / texelCount, green / texelCount, blue / texelCount]
}

/**
 * Mean linear luminance of the texels that cover the subject itself.
 *
 * Those texels sit behind the character, so the value says how much light the
 * character stands in front of. The squint narrows the eyes by it.
 */
export function ambientLightMapInteriorLuminance(
  map: AmbientLightMap,
  margin: AmbientLightMapMargin = ambientLightNeutralMapMargin,
): number {
  const spanX = 1 + 2 * margin.x
  const spanY = 1 + 2 * margin.y
  const startX = margin.x / spanX
  const endX = (1 + margin.x) / spanX
  const startY = margin.y / spanY
  const endY = (1 + margin.y) / spanY

  let total = 0
  let count = 0
  for (let row = 0; row < map.height; row += 1) {
    const v = (row + 0.5) / map.height
    if (v < startY || v > endY)
      continue

    for (let column = 0; column < map.width; column += 1) {
      const u = (column + 0.5) / map.width
      if (u < startX || u > endX)
        continue

      const offset = (row * map.width + column) * 3
      total += relativeLuminance(map.data[offset], map.data[offset + 1], map.data[offset + 2])
      count += 1
    }
  }

  return count > 0 ? total / count : 0
}

/**
 * Measurements of the screen around and behind the stage window, for one
 * capture frame. Both maps share one grid over the window grown by
 * {@link ambientLightMapMargin}.
 */
export interface AmbientLightEnvironment {
  /**
   * Perceived screen level around the window, from 0 to 1. Every visible pixel
   * counts, so a dark desktop reads as dark even with no color to sample.
   */
  exposure: number
  /**
   * Mean linear luminance of the display outside the AIRI window, from 0 to 1.
   *
   * It sets the exposure of the whole model, so a window dragged from a bright
   * area to a dark one does not change how bright the character is. The light
   * maps then shape that level by position. The window is left out because it
   * shows the character rather than the desktop, and counting it would let the
   * character light itself.
   */
  displayLuminance: number
  /**
   * Wide blur of the screen, in linear RGB, reaching about a third of the
   * subject height. It carries the color and the side the light comes from.
   * The sampler also uses it to fill the contact texels that the narrow blur
   * cannot support.
   */
  surround: AmbientLightMap
  /**
   * Narrow blur of the same content, in linear RGB. It drives the light wrap
   * and the backlight rim, which show only what sits next to or behind an edge.
   */
  contact: AmbientLightMap
  /**
   * Mean linear luminance of the contact map over the subject. It says how
   * much light the character stands in front of, and the squint follows it.
   */
  behindLuminance: number
  /**
   * The reach the two maps were placed with, which every reader needs to turn a
   * screen position into a map position. It travels with the maps because it
   * depends on the shape of the subject they were measured around.
   */
  mapMargin: AmbientLightMapMargin
}

/** Default values for the screen ambient-light sampler, renderer, and devtool. */
export const ambientLightDefaults = Object.freeze({
  enabled: false,
  source: 'screen-capture' as ScreenAmbientLightSource,
  forcedColor: '#bf6fff',
  mode: 'window-gradient' as ScreenAmbientLightMode,
  /**
   * Overall effect amount. 1 is the designed look. Values up to 3 scale the
   * light wrap and the backlight rim for a more dramatic response; the
   * reflected light stops at 1, because more of it would only darken.
   */
  strength: 1,
  /**
   * How far a rise in the measured screen level narrows the eyes, from 0 to 1.
   * At 0 the eyes never react.
   *
   * The renderer drives this from the gap between a fast and a slow follower of
   * the screen level, not from the level itself, so a desktop that stays bright
   * leaves the eyes open. See `useMotionUpdatePluginLightSquint`.
   */
  squint: 1,
  /**
   * Time between screen samples, in milliseconds. It also constrains the
   * capture stream, so the renderer never decodes frames it will not sample.
   *
   * One sample costs about 0.5 ms in the sampler plus about 1 ms to draw the
   * stream frame down and read it back, so 50 ms is near 3% of one core. The
   * painted-alpha read that dominated the old budget is cached on its own
   * interval and does not follow this one.
   */
  captureIntervalMs: 50,
  /**
   * Width of the downscaled capture frame, in pixels. It decides how much
   * detail a map texel can hold. The height follows the display, so that a
   * frame pixel is square on screen: a frame stretched into a fixed aspect
   * makes the blur oval and weighs one direction more than the other.
   *
   * At 128 across, a normal stage window covers about 22 x 27 frame pixels on
   * a 2560 x 1440 display, a few pixels per map texel.
   */
  sampleWidth: 128,
  /**
   * Time constant of the smoothing between samples, in milliseconds.
   *
   * It is the lag between a change on screen and the light on the character:
   * one time constant covers 63% of a step and three cover 95%. At the same
   * value as {@link captureIntervalMs} each sample moves the light 63% of the
   * way, which at 20 samples a second reads as continuous.
   */
  responseMs: 50,
  sampling: Object.freeze<AmbientLightSamplingOptions>({
    neutralColorWeight: 0.35,
  }),
  filter: Object.freeze<AmbientLightFilterOptions>({
    darkBase: 0.45,
    baseCurve: 2,
    localShare: 0.5,
    tint: 1,
    colorBoost: 4,
    wrapIntensity: 1.7,
    wrapSaturation: 1,
    wrapDiffuse: 0.03,
    backlight: 1.6,
    translucentWrap: false,
  }),
})

/**
 * Linear levels of the neutral environment. All are colorless.
 *
 * The model reflects the display level and the surround map, so both sit at
 * full light and show the model as drawn when nothing was measured. The
 * contact map sits at half light, which keeps a soft wrap without pretending
 * that a bright screen was measured.
 */
const neutralSurroundLevel = 1
const neutralContactLevel = 0.5

/**
 * Environment used before the first capture, after a reset, and when the window
 * covers the whole display so that no screen pixel remains to measure.
 *
 * The map data is shared between every consumer, so no consumer may write into
 * it.
 */
export const ambientLightNeutralEnvironment: Readonly<AmbientLightEnvironment> = Object.freeze({
  exposure: 0.5,
  displayLuminance: 1,
  mapMargin: ambientLightNeutralMapMargin,
  surround: createAmbientLightMap([neutralSurroundLevel, neutralSurroundLevel, neutralSurroundLevel]),
  contact: createAmbientLightMap([neutralContactLevel, neutralContactLevel, neutralContactLevel]),
  behindLuminance: 0,
})

/** Relative luminance of a linear RGB color, by the sRGB primaries. */
export function relativeLuminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

/** sRGB encoded channel to linear light. Both are 0 to 1. */
export function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** Linear light to the sRGB encoding a display and a canvas expect. */
export function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

/** Linear light to one sRGB byte, as a texture or a canvas pixel stores it. */
export function linearToSrgbByte(value: number): number {
  return Math.round(Math.min(Math.max(linearToSrgb(value), 0), 1) * 255)
}
