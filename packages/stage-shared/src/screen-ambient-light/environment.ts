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
   * Model brightness over a black screen. The measured screen level raises it
   * by up to `exposureRange`.
   *
   * @default 0.5
   */
  baseBrightness: number
  /**
   * How much the measured screen level raises the base brightness. At 0 the
   * model holds one exposure whatever the screen shows.
   *
   * @default 0.5
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
 * twice the window is finer than the blur that produces a map.
 */
export const ambientLightMapSize = 24

/**
 * Screen area a light map covers outside the stage window, as a fraction of the
 * window size on each side. Map uv 0 to 1 spans window uv -0.5 to 1.5.
 *
 * The maps reach past the window because the light that wraps onto the
 * silhouette comes from beside it. The extraction places the texels with this
 * constant and the shader reads them back with it, so the two disagree about
 * every position if they differ.
 */
export const ambientLightMapMargin = 0.5

/** Screen light over the stage window and its margin, as a small color grid. */
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
 * Mean linear luminance of the texels that cover the stage window itself.
 *
 * Those texels sit behind the character, so the value says how much light the
 * character stands in front of. The backlight darkens the interior by it.
 */
export function ambientLightMapInteriorLuminance(map: AmbientLightMap): number {
  const span = 1 + 2 * ambientLightMapMargin
  const start = ambientLightMapMargin / span
  const end = (1 + ambientLightMapMargin) / span

  let total = 0
  let count = 0
  for (let row = 0; row < map.height; row += 1) {
    const v = (row + 0.5) / map.height
    if (v < start || v > end)
      continue

    for (let column = 0; column < map.width; column += 1) {
      const u = (column + 0.5) / map.width
      if (u < start || u > end)
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
   * whole model, and reaches about a third of the window height.
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
  captureIntervalMs: 250,
  /**
   * Size of the downscaled capture frame, in pixels. It decides how much detail
   * a map texel can hold. At 128 x 96 a normal stage window covers about
   * 36 x 46 pixels, a few pixels per map texel.
   */
  sampleWidth: 128,
  sampleHeight: 96,
  responseMs: 650,
  sampling: Object.freeze<AmbientLightSamplingOptions>({
    neutralColorWeight: 0.35,
  }),
  filter: Object.freeze<AmbientLightFilterOptions>({
    baseBrightness: 0.5,
    exposureRange: 0.5,
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
  surround: createAmbientLightMap([neutralAmbientLightLevel, neutralAmbientLightLevel, neutralAmbientLightLevel]),
  contact: createAmbientLightMap([neutralAmbientLightLevel, neutralAmbientLightLevel, neutralAmbientLightLevel]),
  behindLuminance: 0,
})

function relativeLuminance(red: number, green: number, blue: number) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}
