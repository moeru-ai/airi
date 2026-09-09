/** Surface response shared by the character and diagnostic shapes. */
export interface AmbientLightMaterialOptions {
  /** Use matte face relief and restrict sheen to reviewed hair/nose regions. @default true */
  illustrated: boolean
  /** Additional hair shadow on the fitted face; zero retains only painted shadows. @default 0.5 */
  faceShadow: number
  /** Fitted face yaw in degrees at Iru head X=30, from 0 to 45. Zero keeps neutral directions. @default 45 */
  faceYaw: number
  /** Hair reflection roughness in illustrated mode, from 0.15 to 0.9. @default 0.7 */
  roughness: number
  /** Local face diffuse response in illustrated mode, from 0 to 1. Zero uses one face-wide direction. @default 0.8 */
  skinRelief: number
  /** Strength of reflected highlights. @default 1.65 */
  sheen: number
  /** Nose relief for reflection. Zero removes the nose highlight without changing diffuse shading. @default 0.15 */
  nose: number
  /** Compress added light into available headroom instead of clipping. @default true */
  softHighlights: boolean
}

/** Screen geometry in character-height units; +Z points toward the viewer. */
export interface AmbientLightScreenGeometry {
  /** Distance from the character to the flat center. Must be positive. @default 0.11 */
  gap: number
  /** Edge curvature in radians per character height. Nonnegative; zero keeps the screen flat. @default 5 */
  bend: number
  /** Nonnegative half-width of the flat center, in character heights. @default 0.21 */
  flatRadius: number
  /** Cache area-integrated diffuse light and broad highlights by position and normal. @default true */
  areaLights?: boolean
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

/** Independent light emission, camera exposure, and bloom adaptation for the surface-lighting trial. */
export interface AmbientLightExposureOptions {
  /** Derive ambient fill from the smoothed full-screen mean in physical mode. @default true */
  adaptiveBase: boolean
  /** Ambient fill under a black screen, from 0 to 1. @default 0.11 */
  darkBase: number
  /** Ambient fill under a white screen; never applied below darkBase. @default 1 */
  brightBase: number
  /** Power applied to the smoothed linear mean; below one raises dim scenes. @default 2 */
  baseCurve: number
  /** Perceptual color emphasis for dim light. Preserves baseline RGB and lit luminance; zero disables it. Range 0 to 100. @default 94 */
  responseCurve: number
  /** Selects the trial; false reproduces the saved surface response. @default true */
  enabled: boolean
  /** Assumed display-white luminance in cd/m², relative to a 200-nit reference. @default 450 */
  screenNits: number
  /** Camera exposure compensation in stops; +1 doubles linear light. @default -0.2 */
  compensation: number
  /** Adjusts bloom sensitivity using recent screen luminance. @default true */
  adaptiveBloom: boolean
  /** Time constant toward dark surroundings, in seconds. @default 0.5 */
  darkSeconds: number
  /** Time constant toward bright surroundings, in seconds. @default 0.2 */
  brightSeconds: number
}

export interface AmbientLightFilterOptions {
  /**
   * Model brightness over a black screen. The measured screen level raises it
   * by up to `exposureRange`.
   *
   * @default 0.2
   */
  baseBrightness: number
  /**
   * How much the measured screen level raises the base brightness. At 0 the
   * model holds one exposure whatever the screen shows.
   *
   * @default 1
   */
  exposureRange: number
  /** Base model contrast before light is applied. @default 1.43 */
  baseContrast: number
  /**
   * How much of the environment hue the color cast keeps.
   *
   * The cast multiplies the model by the light color at unit luminance, so it
   * changes hue and not brightness. At 0 the cast is white and the model keeps
   * its own colors. At 1 a saturated screen color removes the channels that the
   * light lacks, which turns skin gray.
   *
   * @default 1
   */
  chroma: number
  /**
   * Strength of the light wrap that bleeds the background color into the model
   * silhouette. This is the compositing cue that makes the model read as part
   * of the screen content behind it.
   *
   * @default 0.87
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
   * @default 0.69
   */
  backlight: number
  /** Exterior halo from backlight; zero keeps the original silhouette alpha. @default 1.15 */
  bloom: number
  /**
   * Width of the light wrap band, as a fraction of the model height. It matches
   * the `Diffuse` control of a compositing light-wrap node.
   *
   * The band is a Gaussian blur of the model alpha with a standard deviation of
   * half this width, so the light fades out about one width inside the
   * silhouette and has no inner boundary of its own.
   *
   * @default 0.025
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

/** Rectangle in the normalized coordinates of its owning surface. */
export interface NormalizedRectangle {
  x: number
  y: number
  width: number
  height: number
}

/**
 * One capture's full-display emission and local glow maps. Contact and surround
 * cover the window grown by {@link ambientLightMapMargin}; screen covers only
 * the actual display. Glow extrapolation must never become a surface emitter.
 */
export interface AmbientLightEnvironment {
  /** Actual display emission for surface lighting. Omitted for synthetic color studies. */
  screen?: {
    radiance: AmbientLightMap
    /** Canvas rectangle in display coordinates; may extend outside the display. */
    stage: NormalizedRectangle
    /** Physical canvas width / height, independent of its render resolution. */
    aspect: number
  }

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
  enabled: true,
  source: 'screen-capture' as ScreenAmbientLightSource,
  forcedColor: '#ffdfb0ff',
  mode: 'window-gradient' as ScreenAmbientLightMode,
  /** Overall amount for surface lighting and silhouette light wrap. */
  strength: 1.16,
  /** Eye reaction to brightness rising above the shared adapted level. Zero disables it. */
  squint: 1,
  /** Surface highlights and the reviewed Iru nose correction. */
  material: Object.freeze<AmbientLightMaterialOptions>({ illustrated: true, faceShadow: 0.5, faceYaw: 45, roughness: 0.7, skinRelief: 0.8, sheen: 1.65, nose: 0.15, softHighlights: true }),
  /** Virtual screen shape used by directional Live2D surface lighting. */
  geometry: Object.freeze<AmbientLightScreenGeometry>({ areaLights: true, gap: 0.11, bend: 5, flatRadius: 0.21 }),
  exposure: Object.freeze<AmbientLightExposureOptions>({ adaptiveBase: true, darkBase: 0.11, brightBase: 1, baseCurve: 2, responseCurve: 94, enabled: true, screenNits: 450, compensation: -0.2, adaptiveBloom: true, darkSeconds: 0.5, brightSeconds: 0.2 }),
  captureIntervalMs: 50,
  /** Dimensions of the downscaled capture frame used to build light maps. */
  sampleWidth: 160,
  sampleHeight: 120,
  responseMs: 50,
  filter: Object.freeze<AmbientLightFilterOptions>({
    baseBrightness: 0.2,
    exposureRange: 1,
    baseContrast: 1.43,
    chroma: 1,
    wrapIntensity: 0.87,
    wrapDiffuse: 0.025,
    backlight: 0.69,
    bloom: 1.15,
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
