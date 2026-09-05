import type { FilterSystem, RenderTexture } from '@pixi/core'
import type {
  AmbientLightEnvironment,
  AmbientLightFilterOptions,
  AmbientLightMap,
  ScreenAmbientLightMode,
} from '@proj-airi/stage-shared/screen-ambient-light'

import { ALPHA_MODES, CLEAR_MODES, MIPMAP_MODES, SCALE_MODES, WRAP_MODES } from '@pixi/constants'
import { BaseTexture, Filter, Texture } from '@pixi/core'
import {
  ambientLightDefaults,
  ambientLightMapMargin,
  ambientLightMapSize,
  averageAmbientLightMap,
} from '@proj-airi/stage-shared/screen-ambient-light'

/**
 * Transparent margin kept around the model, in pixels.
 *
 * The blur passes read the model alpha beyond the silhouette. Without a margin
 * a silhouette that touches the filter frame reads its own alpha past the
 * frame edge, and no wrap appears there.
 */
const wrapPadding = 16

/**
 * Resolution of the alpha blur passes relative to the filter input.
 *
 * The blurred alpha is a low-frequency signal. Half resolution keeps one texel
 * per CSS pixel on a 2x display, and the two passes then touch a quarter of the
 * input pixels. Bilinear filtering on the way back up keeps the mask
 * continuous.
 */
const blurResolutionScale = 0.5

/**
 * Taps on each side of the center tap in one blur pass, and their spacing in
 * standard deviations. Six taps half a deviation apart span three deviations,
 * which holds 99.7% of the kernel.
 */
const blurHalfTaps = 6
const blurTapSpacingSigma = 0.5

/**
 * Standard deviation of the backlight rim, as a fraction of the frame height.
 *
 * Light from behind grazes the edge of a subject, so the rim stays thin: 0.004
 * is 2 CSS pixels on a 480 pixel window. The wrap band is the wide component.
 */
const backlightRimSigma = 0.004

/**
 * Backlight response at full amount. The shade is the fraction of the model
 * brightness that a full backlight removes everywhere, because the eye adapts
 * to the bright plate behind the character and the subject in front of it
 * goes darker as a whole. The rim gain lights the thin rim band and the glow
 * gain adds a faint spill over the wide wrap band.
 */
const backlightShade = 0.45
const backlightRimGain = 2
const backlightGlowGain = 0.6

/**
 * One separable blur pass over the model alpha.
 *
 * The first pass reads the model alpha and blurs it horizontally. The second
 * pass reads the first result and blurs it vertically. Both write two
 * channels: r is the rim blur and g is the wrap blur, so one pass chain serves
 * both bands. The weights arrive normalized per channel.
 */
const blurFragmentShader = `
varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform highp vec2 uSourceScale;
uniform highp vec4 uSourceClamp;
uniform highp vec2 uTapStep;
uniform float uReadAlpha;
uniform vec2 uWeights[${blurHalfTaps + 1}];

vec2 coverageAt(vec2 coord) {
  vec4 texel = texture2D(uSampler, clamp(coord, uSourceClamp.xy, uSourceClamp.zw));
  return mix(texel.rg, texel.aa, uReadAlpha);
}

void main(void) {
  vec2 center = vTextureCoord * uSourceScale;
  vec2 sum = coverageAt(center) * uWeights[0];
  for (int tap = 1; tap <= ${blurHalfTaps}; tap += 1) {
    vec2 offset = uTapStep * float(tap);
    sum += (coverageAt(center + offset) + coverageAt(center - offset)) * uWeights[tap];
  }
  gl_FragColor = vec4(sum, 0.0, 1.0);
}
`

const fragmentShader = `
varying vec2 vTextureCoord;

uniform sampler2D uSampler;

// The clamp holds texture coordinates on a texture up to 2048 pixels wide, and
// the default mediump float of a fragment shader cannot resolve one texel at
// that size.
uniform highp vec4 inputClamp;

// Pixi sets this global uniform to the rectangle that the filter covers, in
// stage pixels. The default vertex shader declares it with no precision
// qualifier, which means highp in a vertex shader, and a uniform declared with
// two precisions in one program fails to link. This declaration must therefore
// stay highp.
uniform highp vec4 outputFrame;

uniform sampler2D uWrapAlpha;
uniform highp vec2 uWrapScale;
uniform highp vec4 uWrapClamp;
uniform sampler2D uSurroundMap;
uniform sampler2D uContactMap;
uniform vec3 uSurroundAverage;
uniform vec3 uContactAverage;
uniform highp vec2 uStageSize;
uniform float uBacklight;
uniform float uBehindLevel;
uniform float uDirectional;
uniform float uStrength;
uniform float uBaseBrightness;
uniform float uBaseContrast;
uniform float uExposure;
uniform float uExposureRange;
uniform float uChroma;
uniform float uWrapIntensity;
uniform float uSurroundPeak;
uniform float uTranslucentWrap;

const vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);

// Linear luminance below which the cast fades out. 0.04 is an sRGB gray of
// about #383838. A screen darker than that gives almost no light, and the hue
// of what remains comes from window chrome and noise, so the unit-luminance
// cast would turn it into a saturated tint.
const float castFloorLuminance = 0.04;

// Largest factor the cast may apply to one channel. Unit luminance divides the
// light by its luminance, and red carries only 0.21 of the luminance weight,
// so a pure red screen asks for 4.4x on red, or 2.7x at chroma 0.5. The cap
// trades luminance for headroom: it holds the hue shift, because the channels
// the light lacks are still scaled down, but a strongly saturated screen then
// darkens the model instead of pushing one channel toward white.
const float castGainLimit = 1.6;

// Mirrors ambientLightMapMargin in @proj-airi/stage-shared/screen-ambient-light.
// The extraction places the map texels with it and this shader reads them back
// with it, so the two disagree about every position if they differ.
const float mapMargin = ${ambientLightMapMargin.toFixed(4)};

vec3 srgbToLinear(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), color));
}

vec3 linearToSrgb(vec3 color) {
  vec3 low = color * 12.92;
  vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), color));
}

/**
 * Perceived level of an amount of light, from 0 to 1.
 *
 * The backlight amount is tuned by eye against what the screen looks like, so
 * it follows the sRGB encoding of the luminance rather than the linear energy.
 */
float perceptualLevel(float linearValue) {
  float safe = max(linearValue, 0.0);
  float low = safe * 12.92;
  float high = 1.055 * pow(max(safe, 0.000001), 1.0 / 2.4) - 0.055;
  return clamp(mix(low, high, step(0.0031308, safe)), 0.0, 1.0);
}

/**
 * Converts a light color into a color cast with unit luminance.
 *
 * The cast multiplies the model, so it changes hue and leaves brightness to the
 * exposure term. Unit luminance holds only while every channel stays under
 * castGainLimit.
 *
 * Two fades scale the cast down. Below castFloorLuminance it fades out. Above
 * it the cast scales with this light against the brightest light in the map, so
 * a position that receives only a faint bleed takes only a faint tint. That
 * level is the largest channel, not the luminance, so a blue window counts as
 * much light as a red one. Both fades are continuous, so neighboring positions
 * blend instead of flipping between a white cast and a full one.
 *
 * @param referenceLevel Largest channel of the brightest light in the map.
 */
vec3 castFrom(vec3 lightLinear, float chroma, float referenceLevel) {
  float luminance = dot(lightLinear, luminanceWeights);
  vec3 unit = luminance > 0.0005 ? min(lightLinear / luminance, vec3(castGainLimit)) : vec3(1.0);
  float presence = smoothstep(0.0, castFloorLuminance, luminance);
  float level = max(lightLinear.r, max(lightLinear.g, lightLinear.b));
  presence *= clamp(level / max(referenceLevel, 0.0005), 0.0, 1.0);
  return mix(vec3(1.0), unit, chroma * presence);
}

void main(void) {
  vec4 source = texture2D(uSampler, vTextureCoord);
  if (source.a <= 0.0) {
    gl_FragColor = source;
    return;
  }

  // Pixi hands out filter textures from a pool, so the texture is usually
  // larger than the model frame and the frame starts at the texture origin.
  // inputClamp marks the frame, and every position below is relative to it.
  vec2 frameExtent = max(inputClamp.zw - inputClamp.xy, vec2(0.0001));
  vec2 frameCoord = (vTextureCoord - inputClamp.xy) / frameExtent;

  // Where this fragment sits on the stage, and then inside the light maps.
  // Every light lookup below uses this position, so a sleeve takes the color
  // of the screen beside the sleeve rather than a color shared by its whole
  // side of the model.
  vec2 windowUv = (outputFrame.xy + frameCoord * outputFrame.zw) / uStageSize;
  vec2 mapUv = (windowUv + mapMargin) / (1.0 + 2.0 * mapMargin);

  vec3 baseLinear = srgbToLinear(source.rgb / source.a);
  float effect = min(uStrength, 1.0);

  // The measured screen level moves the base exposure. A positive range
  // brightens the model with the screen, which is the light the screen throws
  // on it. A negative range darkens it instead, which keeps the unlit side
  // dark so that the wrap and the rim read against it. At 0 the model keeps a
  // constant exposure.
  float measuredBase = clamp(uBaseBrightness + uExposureRange * uExposure, 0.0, 1.0);
  float brightness = mix(1.0, measuredBase, effect);
  float contrast = mix(1.0, uBaseContrast, effect);
  vec3 exposed = pow(baseLinear, vec3(contrast)) * brightness;

  // Global mode replaces both lookups with the mean of the map, so the whole
  // model takes one color.
  vec3 surroundLight = mix(uSurroundAverage, srgbToLinear(texture2D(uSurroundMap, mapUv).rgb), uDirectional);
  vec3 contactLight = mix(uContactAverage, srgbToLinear(texture2D(uContactMap, mapUv).rgb), uDirectional);

  // Color cast from the wide blur of the screen. A diffuse surface integrates
  // its environment over a hemisphere, and the wide blur is that low-pass,
  // applied once per capture instead of once per fragment. Global mode casts
  // the map mean everywhere, so the mean is its own reference and the cast
  // keeps full strength.
  float meanLevel = max(uSurroundAverage.r, max(uSurroundAverage.g, uSurroundAverage.b));
  float castReference = mix(meanLevel, uSurroundPeak, uDirectional);
  vec3 lit = exposed * castFrom(surroundLight, clamp(uChroma * uStrength, 0.0, 1.0), castReference);

  // Light wrap: the plate color bleeds around the edge of the model, the way a
  // compositor blends a foreground element into its plate. The stage window is
  // transparent, so the desktop behind the model is a real plate.
  //
  // The blurred alpha falls below one only near a silhouette, so its product
  // with the model alpha forms a band that fades inward. The blur is a
  // Gaussian, so the band is continuous in the distance to the edge and has no
  // inner boundary of its own. The color comes from the narrow blur at the
  // fragment position, because what shows behind a gap between two strands is
  // the desktop at that position. A strand thinner than the band takes the
  // band over its whole width.
  vec2 blurredAlpha = texture2D(uWrapAlpha, clamp(vTextureCoord * uWrapScale, uWrapClamp.xy, uWrapClamp.zw)).rg;

  // The bands scale with the model alpha. The translucent-wrap option squares
  // it, so a part drawn with partial alpha receives less of the plate color
  // that it already shows through itself. An opaque part is the same either
  // way.
  float coverage = source.a * mix(1.0, source.a, uTranslucentWrap);
  float rimMask = coverage * (1.0 - blurredAlpha.r);
  float wrapMask = coverage * (1.0 - blurredAlpha.g);
  vec3 wrapLight = contactLight * wrapMask * uWrapIntensity * uStrength;

  // Backlight. A subject in front of a bright plate reads as a silhouette: the
  // whole interior goes darker, a thin rim lights up along the whole edge, and
  // a faint spill follows the wrap band.
  //
  // The rim follows the light behind each part of the edge, so an edge in front
  // of a dark area stays dark. The interior darkening instead follows one level
  // for the whole window, because darkening that changed across the body would
  // draw a second outline inside the silhouette.
  float rimAmount = clamp(uBacklight * perceptualLevel(dot(contactLight, luminanceWeights)) * uStrength, 0.0, 2.0);
  float interiorAmount = clamp(uBacklight * uBehindLevel * uStrength, 0.0, 2.0);
  lit *= 1.0 - ${backlightShade.toFixed(3)} * min(interiorAmount, 1.0);
  wrapLight += contactLight * rimAmount * (rimMask * ${backlightRimGain.toFixed(3)} + wrapMask * ${backlightGlowGain.toFixed(3)});

  // Added light compresses into the remaining headroom instead of clipping, so
  // bright texture detail under a strong wrap keeps its differences.
  vec3 headroom = max(vec3(0.0), vec3(1.0) - lit);
  vec3 compressedWrap = headroom * (vec3(1.0) - exp(-wrapLight / max(headroom, vec3(0.0001))));
  vec3 litLinear = clamp(lit + compressedWrap, 0.0, 1.0);

  gl_FragColor = vec4(linearToSrgb(litLinear) * source.a, source.a);
}
`

/** One frame of measurements that the filter turns into shader uniforms. */
export interface ScreenAmbientLightFilterUpdate {
  environment: AmbientLightEnvironment
  mode: ScreenAmbientLightMode
  strength: number
  options: AmbientLightFilterOptions
}

/**
 * Applies screen-derived color cast and light wrap to a Live2D model.
 *
 * Each frame runs three passes. Two half-resolution passes blur the model
 * alpha, horizontally and then vertically, into a texture that holds the rim
 * band and the wrap band. The main pass then lights the model and reads that
 * texture for both bands.
 *
 * The light itself arrives as two small maps that cover the stage window and a
 * margin around it. The main pass reads them by the position of the fragment on
 * the stage, so the mapping only holds while the stage renders straight to the
 * screen: `apply` reads the screen size for that conversion.
 */
export class ScreenAmbientLightFilter extends Filter {
  /**
   * The two light maps as sRGB texels.
   *
   * An 8-bit texel keeps its precision where the eye needs it, and the shader
   * decodes back to linear light. Linear filtering blends between texels, and
   * clamped wrapping repeats the border for a fragment that sits outside the
   * map, which happens for the padding around the model.
   */
  private readonly surroundTexels: Uint8Array
  private readonly contactTexels: Uint8Array
  private readonly surroundTexture: Texture
  private readonly contactTexture: Texture
  private readonly surroundAverage = new Float32Array([1, 1, 1])
  private readonly contactAverage = new Float32Array([1, 1, 1])
  private readonly stageSize = new Float32Array([1, 1])
  /**
   * Brightest perceived level in the contact map.
   *
   * The rim amount is a per-fragment value, so the early-out in `apply` cannot
   * read it. The peak answers the only question the early-out asks: whether any
   * fragment can receive a rim at all.
   */
  private contactPeakLevel = 0
  private readonly blurPass: Filter
  /** Interleaved rim and wrap weights, one pair per tap from the center out. */
  private readonly blurWeights = new Float32Array((blurHalfTaps + 1) * 2)
  private wrapDiffuse = ambientLightDefaults.filter.wrapDiffuse
  private uploadedEnvironment: AmbientLightEnvironment | undefined

  constructor() {
    const surroundTexels = new Uint8Array(ambientLightMapSize * ambientLightMapSize * 4)
    const contactTexels = new Uint8Array(ambientLightMapSize * ambientLightMapSize * 4)
    surroundTexels.fill(255)
    contactTexels.fill(255)
    const surroundTexture = createMapTexture(surroundTexels)
    const contactTexture = createMapTexture(contactTexels)

    super(undefined, fragmentShader, {
      uWrapAlpha: Texture.WHITE,
      uWrapScale: new Float32Array([1, 1]),
      uWrapClamp: new Float32Array([0, 0, 1, 1]),
      uSurroundMap: surroundTexture,
      uContactMap: contactTexture,
      uSurroundAverage: new Float32Array([1, 1, 1]),
      uContactAverage: new Float32Array([1, 1, 1]),
      uStageSize: new Float32Array([1, 1]),
      uBacklight: ambientLightDefaults.filter.backlight,
      uBehindLevel: 0,
      uDirectional: 0,
      uStrength: 0,
      uBaseBrightness: ambientLightDefaults.filter.baseBrightness,
      uBaseContrast: ambientLightDefaults.filter.baseContrast,
      uExposure: 0.5,
      uExposureRange: ambientLightDefaults.filter.exposureRange,
      uChroma: ambientLightDefaults.filter.chroma,
      uWrapIntensity: ambientLightDefaults.filter.wrapIntensity,
      uSurroundPeak: 1,
      uTranslucentWrap: 0,
    })

    this.surroundTexels = surroundTexels
    this.contactTexels = contactTexels
    this.surroundTexture = surroundTexture
    this.contactTexture = contactTexture
    this.padding = wrapPadding
    this.blurPass = new Filter(undefined, blurFragmentShader, {
      uSourceScale: new Float32Array([1, 1]),
      uSourceClamp: new Float32Array([0, 0, 1, 1]),
      uTapStep: new Float32Array([0, 0]),
      uReadAlpha: 1,
      uWeights: this.blurWeights,
    })
  }

  /**
   * Updates the uniforms in place.
   *
   * The maps upload only when the environment object changes, so a caller that
   * runs every frame with the same environment costs no GPU upload.
   */
  update(next: ScreenAmbientLightFilterUpdate) {
    const { environment, options } = next

    if (environment !== this.uploadedEnvironment) {
      this.uploadMaps(environment)
      this.uploadedEnvironment = environment
    }

    this.uniforms.uDirectional = next.mode === 'window-gradient' ? 1 : 0
    this.uniforms.uStrength = clamp(next.strength, 0, 3)
    this.uniforms.uBaseBrightness = clamp(options.baseBrightness, 0, 1)
    this.uniforms.uBaseContrast = clamp(options.baseContrast, 0.5, 2)
    this.uniforms.uExposure = clamp(environment.exposure, 0, 1)
    this.uniforms.uExposureRange = clamp(options.exposureRange, -1, 1)
    this.uniforms.uChroma = clamp(options.chroma, 0, 1)
    this.uniforms.uWrapIntensity = Math.max(0, options.wrapIntensity)
    this.uniforms.uBacklight = clamp(options.backlight, 0, 2)
    this.uniforms.uTranslucentWrap = options.translucentWrap ? 1 : 0
    this.wrapDiffuse = clamp(options.wrapDiffuse, 0, 0.5)
  }

  /**
   * Blurs the model alpha in two half-resolution passes, then lights the model.
   *
   * The pool textures for the blur have the frame of the input but may differ
   * from it in size, so every read of one of them rescales the input texture
   * coordinate and clamps to its own frame. Both pool textures return to the
   * pool before this returns.
   */
  override apply(filterManager: FilterSystem, input: RenderTexture, output: RenderTexture, clearMode?: CLEAR_MODES) {
    // The stage size turns the filter frame, which Pixi reports in stage
    // pixels, into a position inside the window and then inside the maps.
    const screen = filterManager.renderer.screen
    this.stageSize[0] = Math.max(1, screen.width)
    this.stageSize[1] = Math.max(1, screen.height)
    this.uniforms.uStageSize = this.stageSize

    // With no wrap and no backlight, both bands multiply by zero. A white
    // texture reads as fully covered, which is the same mask at no cost.
    if (!this.needsBands()) {
      this.uniforms.uWrapAlpha = Texture.WHITE
      filterManager.applyFilter(this, input, output, clearMode)
      return
    }

    const frame = input.filterFrame ?? input.frame
    const blurResolution = input.resolution * blurResolutionScale
    const horizontal = filterManager.getFilterTexture(input, blurResolution)
    const vertical = filterManager.getFilterTexture(input, blurResolution)

    // Both bands follow the frame height, which is the character height on
    // screen, so they keep their proportion when the window or model resizes.
    // The wrap deviation is half the diffuse width, so the band fades out
    // about one width inside the silhouette.
    const frameHeight = Math.max(frame.height, 1)
    const wrapSigma = 0.5 * this.wrapDiffuse * frameHeight
    const rimSigma = backlightRimSigma * frameHeight
    const tapSpacing = Math.max(wrapSigma, rimSigma) * blurTapSpacingSigma
    writeGaussianWeights(this.blurWeights, tapSpacing, rimSigma, wrapSigma)

    const pass = this.blurPass
    pass.uniforms.uReadAlpha = 1
    setBlurSource(pass, input, input)
    pass.uniforms.uTapStep[0] = tapSpacing / input.width
    pass.uniforms.uTapStep[1] = 0
    filterManager.applyFilter(pass, input, horizontal, CLEAR_MODES.CLEAR)

    pass.uniforms.uReadAlpha = 0
    setBlurSource(pass, input, horizontal)
    pass.uniforms.uTapStep[0] = 0
    pass.uniforms.uTapStep[1] = tapSpacing / horizontal.height
    filterManager.applyFilter(pass, horizontal, vertical, CLEAR_MODES.CLEAR)

    this.uniforms.uWrapAlpha = vertical
    this.uniforms.uWrapScale[0] = input.width / vertical.width
    this.uniforms.uWrapScale[1] = input.height / vertical.height
    writeFrameClamp(this.uniforms.uWrapClamp, vertical)
    filterManager.applyFilter(this, input, output, clearMode)

    // A pooled texture must not stay referenced after it returns to the pool.
    this.uniforms.uWrapAlpha = Texture.WHITE
    filterManager.returnFilterTexture(horizontal)
    filterManager.returnFilterTexture(vertical)
  }

  override destroy() {
    super.destroy()
    this.blurPass.destroy()
    this.surroundTexture.destroy(true)
    this.contactTexture.destroy(true)
  }

  private needsBands() {
    const strength = this.uniforms.uStrength as number
    const wrap = (this.uniforms.uWrapIntensity as number) * strength
    const backlight = (this.uniforms.uBacklight as number) * strength
      * Math.max(this.contactPeakLevel, this.uniforms.uBehindLevel as number)
    return wrap > 0 || backlight > 0
  }

  private uploadMaps(environment: AmbientLightEnvironment) {
    writeMapTexels(this.surroundTexels, environment.surround)
    writeMapTexels(this.contactTexels, environment.contact)
    this.surroundTexture.baseTexture.update()
    this.contactTexture.baseTexture.update()

    // Global mode needs one color per map. Both travel as uniforms so that the
    // shader needs no second lookup.
    this.surroundAverage.set(averageAmbientLightMap(environment.surround))
    this.contactAverage.set(averageAmbientLightMap(environment.contact))
    this.uniforms.uSurroundAverage = this.surroundAverage
    this.uniforms.uContactAverage = this.contactAverage

    this.contactPeakLevel = peakPerceptualLevel(environment.contact)
    this.uniforms.uBehindLevel = clamp(linearToSrgb(environment.behindLuminance), 0, 1)
    // The cast scales each position against the brightest light in the map,
    // so the reference is the largest channel of the brightest texel.
    this.uniforms.uSurroundPeak = peakChannel(environment.surround)
  }
}

/** Largest linear channel value in a map, from 0 to 1. */
function peakChannel(map: AmbientLightMap) {
  let peak = 0
  for (let index = 0; index < map.data.length; index += 1)
    peak = Math.max(peak, map.data[index])
  return Math.min(peak, 1)
}

function createMapTexture(texels: Uint8Array) {
  return new Texture(BaseTexture.fromBuffer(
    texels,
    ambientLightMapSize,
    ambientLightMapSize,
    {
      alphaMode: ALPHA_MODES.NO_PREMULTIPLIED_ALPHA,
      mipmap: MIPMAP_MODES.OFF,
      scaleMode: SCALE_MODES.LINEAR,
      wrapMode: WRAP_MODES.CLAMP,
    },
  ))
}

/**
 * Points a blur pass at `source`.
 *
 * The pass receives texture coordinates over the filter input, so reading a
 * pool texture of another size needs the ratio of the two sizes.
 */
function setBlurSource(pass: Filter, input: RenderTexture, source: RenderTexture) {
  pass.uniforms.uSourceScale[0] = input.width / source.width
  pass.uniforms.uSourceScale[1] = input.height / source.height
  writeFrameClamp(pass.uniforms.uSourceClamp, source)
}

/** The range is inset by half a texel, so that bilinear reads stay on the frame. */
function writeFrameClamp(target: Float32Array, texture: RenderTexture) {
  const frame = texture.filterFrame ?? texture.frame
  const halfTexelX = 0.5 / (texture.width * texture.resolution)
  const halfTexelY = 0.5 / (texture.height * texture.resolution)
  target[0] = halfTexelX
  target[1] = halfTexelY
  target[2] = frame.width / texture.width - halfTexelX
  target[3] = frame.height / texture.height - halfTexelY
}

/**
 * Writes normalized Gaussian weights for the rim and the wrap blur as
 * interleaved pairs, one pair per tap from the center outward.
 *
 * Both kernels share the tap positions, which sit `spacing` pixels apart. A
 * deviation much smaller than the spacing leaves only the center tap, which is
 * the bilinear read of the source and the narrowest blur the pass can make.
 */
function writeGaussianWeights(target: Float32Array, spacing: number, rimSigma: number, wrapSigma: number) {
  const sigmas = [Math.max(rimSigma, 0.0001), Math.max(wrapSigma, 0.0001)]
  for (const [channel, sigma] of sigmas.entries()) {
    let total = 0
    for (let tap = 0; tap <= blurHalfTaps; tap += 1) {
      const distance = tap * spacing
      const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma))
      target[tap * 2 + channel] = weight
      total += tap === 0 ? weight : 2 * weight
    }
    for (let tap = 0; tap <= blurHalfTaps; tap += 1)
      target[tap * 2 + channel] /= total
  }
}

/** Writes one map of linear colors into the sRGB texels of its texture. */
function writeMapTexels(texels: Uint8Array, map: AmbientLightMap) {
  const texelCount = ambientLightMapSize * ambientLightMapSize
  for (let texel = 0; texel < texelCount; texel += 1) {
    texels[texel * 4] = toTexel(linearToSrgb(map.data[texel * 3]))
    texels[texel * 4 + 1] = toTexel(linearToSrgb(map.data[texel * 3 + 1]))
    texels[texel * 4 + 2] = toTexel(linearToSrgb(map.data[texel * 3 + 2]))
    texels[texel * 4 + 3] = 255
  }
}

function peakPerceptualLevel(map: AmbientLightMap) {
  let peak = 0
  for (let texel = 0; texel < map.width * map.height; texel += 1) {
    const luminance = map.data[texel * 3] * 0.2126
      + map.data[texel * 3 + 1] * 0.7152
      + map.data[texel * 3 + 2] * 0.0722
    peak = Math.max(peak, luminance)
  }

  return clamp(linearToSrgb(peak), 0, 1)
}

function toTexel(value: number) {
  return Math.round(clamp(value, 0, 1) * 255)
}

function linearToSrgb(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
