/** Surface response shared by the character and diagnostic shapes. */
export interface AmbientLightMaterialOptions {
  /** Strength of broad reflected highlights. @default 0.8 */
  sheen: number
  /** Relief of the hand-fitted Iru nose; zero restores the smooth face. @default 1 */
  nose: number
  /** Compress added light into available headroom instead of clipping. @default true */
  softHighlights: boolean
}

/** Screen geometry in window-height units; +Z points toward the viewer. */
export interface AmbientLightScreenGeometry {
  /** Distance from the character to the flat center. Must be positive. @default 0.04 */
  gap: number
  /** Edge curvature in radians per window height. Nonnegative; zero keeps the screen flat. @default 2 */
  bend: number
  /** Nonnegative half-width of the flat center, in window heights. @default 0.1 */
  flatRadius: number
}

/** One measured light color. The channels are sRGB, from 0 to 1. */
export interface AmbientLightSample {
  red: number
  green: number
  blue: number
  /** Relative luminance in linear light, not sRGB, from 0 to 1. */
  luminance: number
}

// The persisted 'window-gradient' key now selects directional surface lighting.
// Keeping the key preserves the user's directional/global preference.
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
   * Model brightness when the screen is black. The measured screen level moves
   * it from here by `exposureRange`, in either direction.
   *
   * @default 1
   */
  baseBrightness: number
  /**
   * How far the measured screen level moves the base brightness, and in which
   * direction.
   *
   * Positive brightens the model as the screen brightens, which is the light
   * the screen throws on it. Negative darkens it instead, which holds the
   * unlit side dark so that the light wrap keeps its contrast against it. At 0
   * the model holds one exposure whatever the screen shows.
   *
   * @default -0.3
   */
  exposureRange: number
  /** Base model contrast before light is applied. @default 1.2 */
  baseContrast: number
  /**
   * How much of the environment hue the color cast keeps.
   *
   * The cast multiplies the model by the light color at unit luminance, so it
   * changes hue and not brightness. At 0 the cast is white and the model keeps
   * its own colors. At 1 a saturated screen color removes the channels that the
   * light lacks, which turns skin gray.
   *
   * @default 0.5
   */
  chroma: number
  /**
   * Strength of the light wrap that bleeds the background color into the model
   * silhouette. This is the compositing cue that makes the model read as part
   * of the screen content behind it.
   *
   * @default 0.85
   */
  wrapIntensity: number
  /**
   * Strength of the backlight: a thin rim along the whole silhouette, a faint
   * spill over the wrap band, and an evenly darker interior.
   *
   * A subject in front of a bright plate reads as a silhouette. The rim amount
   * follows the contact map at each fragment, so an edge with a dark desktop
   * behind it gains nothing.
   *
   * @default 0.8
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
 * character stands in front of. The backlight darkens the interior by it.
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
   * Wide blur of the screen, in linear RGB. It drives the color cast over the
   * whole model, and reaches about a third of the subject height.
   */
  surround: AmbientLightMap
  /**
   * Narrow blur of the same content, in linear RGB. It drives the light wrap
   * and the backlight rim, which show only what sits next to or behind an edge.
   */
  contact: AmbientLightMap
  /**
   * Mean linear luminance of the contact map over the window interior. The
   * backlight darkens the interior by one amount, so the darkening cannot draw
   * an outline of its own. Zero switches the darkening off.
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
   * color cast and the light wrap for a more dramatic response.
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
  /** Surface highlights and the reviewed Iru nose correction. */
  material: Object.freeze<AmbientLightMaterialOptions>({ sheen: 0.8, nose: 1, softHighlights: true }),
  /** Virtual screen shape used by directional Live2D surface lighting. */
  geometry: Object.freeze<AmbientLightScreenGeometry>({ gap: 0.04, bend: 2, flatRadius: 0.1 }),
  captureIntervalMs: 250,
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
  responseMs: 650,
  sampling: Object.freeze<AmbientLightSamplingOptions>({
    neutralColorWeight: 0.35,
  }),
  filter: Object.freeze<AmbientLightFilterOptions>({
    baseBrightness: 1,
    exposureRange: -0.3,
    baseContrast: 1.2,
    chroma: 0.5,
    wrapIntensity: 0.85,
    wrapDiffuse: 0.03,
    backlight: 0.8,
    translucentWrap: false,
  }),
})

/**
 * Linear level of the neutral maps. The value is colorless, so the cast keeps
 * the model colors. Half of full light keeps the wrap visible without
 * pretending that a bright screen was measured.
 */
const neutralAmbientLightLevel = 0.5

/**
 * Environment used before the first capture, after a reset, and when the window
 * covers the whole display so that no screen pixel remains to measure.
 *
 * The map data is shared between every consumer, so no consumer may write into
 * it.
 */
export const ambientLightNeutralEnvironment: Readonly<AmbientLightEnvironment> = Object.freeze({
  exposure: 0.5,
  mapMargin: ambientLightNeutralMapMargin,
  surround: createAmbientLightMap([neutralAmbientLightLevel, neutralAmbientLightLevel, neutralAmbientLightLevel]),
  contact: createAmbientLightMap([neutralAmbientLightLevel, neutralAmbientLightLevel, neutralAmbientLightLevel]),
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
