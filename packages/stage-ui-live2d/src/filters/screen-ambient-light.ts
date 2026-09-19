import type { FilterSystem, RenderTexture } from '@pixi/core'
import type {
  AmbientLightEnvironment,
  AmbientLightFilterOptions,
  AmbientLightMap,
  NormalizedRectangle,
  ScreenAmbientLightMode,
} from '@proj-airi/stage-shared/screen-ambient-light'

import { ALPHA_MODES, CLEAR_MODES, MIPMAP_MODES, SCALE_MODES, WRAP_MODES } from '@pixi/constants'
import { BaseTexture, Filter, Texture } from '@pixi/core'
import {
  ambientLightDefaults,
  ambientLightMapSize,
  ambientLightNeutralMapMargin,
  averageAmbientLightMap,
  linearToSrgbByte,
  wholeWindowRectangle,
} from '@proj-airi/stage-shared/screen-ambient-light'
import { clamp } from 'es-toolkit'

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
uniform float uDirectional;
uniform float uStrength;
uniform float uDisplayLevel;
uniform float uDarkBase;
uniform float uBaseCurve;
uniform float uLocalShare;
uniform float uTint;
uniform float uColorBoost;
uniform float uWrapIntensity;
uniform float uWrapSaturation;
uniform float uTranslucentWrap;
// How far the maps reach past the window on each axis, in units of that axis.
// The two differ whenever the window is not square and they stand for the same
// distance on screen. The measurement places the texels with this pair, so the
// two disagree about every position if they differ.
uniform vec2 uMapMargin;
// Where the renderer drew its subject inside the stage window, as x, y, width
// and height in window units. The measurement places the maps around this
// rectangle, so reading them anywhere else lands on the wrong texel: a window
// wider than its subject would otherwise stretch the maps across its empty
// half.
uniform highp vec4 uSubjectRect;

const vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);

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

// Public-domain linear sRGB / Oklab matrices by Bjorn Ottosson:
// https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
vec3 toOklab(vec3 c) {
  vec3 lms = vec3(dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
                  dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
                  dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)));
  lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
  return vec3(dot(lms, vec3(0.2104542553, 0.7936177850, -0.0040720468)),
              dot(lms, vec3(1.9779984951, -2.4285922050, 0.4505937099)),
              dot(lms, vec3(0.0259040371, 0.7827717662, -0.8086757660)));
}

vec3 fromOklab(vec3 c) {
  vec3 lms = vec3(c.x + 0.3963377774 * c.y + 0.2158037573 * c.z,
                  c.x - 0.1055613458 * c.y - 0.0638541728 * c.z,
                  c.x - 0.0894841775 * c.y - 1.2914855480 * c.z);
  lms = lms * lms * lms;
  return vec3(dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
              dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
              dot(lms, vec3(-0.0041960863, -0.7034186147, 1.7076147010)));
}

/**
 * Moves a lit color further from its unlit self in hue, at the same luminance.
 *
 * A saturated light carries little energy: blue at full strength has 7% of the
 * luminance of white, so light that looks strongly blue barely moves the model.
 * The extra chroma grows with the saturation of the light and falls as the
 * light gets brighter, so it lifts the dim colored case and leaves a bright one
 * as the physics produced it.
 *
 * Two limits keep the result honest. The shift is projected onto constant
 * linear luminance, because Oklab lightness is perceptual and not luminance, so
 * moving chroma alone would still change how bright the fragment is. It is then
 * shortened until every channel stays between the unlit color and white: light
 * may only add, so no channel may fall below what the model shows with the
 * screen switched off.
 */
vec3 enhanceLightColor(vec3 unlit, vec3 lit, vec3 incident) {
  float peak = max(incident.r, max(incident.g, incident.b));
  float low = min(incident.r, min(incident.g, incident.b));
  if (uColorBoost <= 0.0 || peak <= 0.000001 || peak - low <= peak * 0.001)
    return lit;

  float intensity = dot(lit - unlit, luminanceWeights);
  if (intensity <= 0.000001)
    return lit;

  float saturation = (peak - low) / peak;
  vec3 unlitLab = toOklab(unlit);
  vec3 litLab = toOklab(lit);
  // The gain halves at an added luminance of 0.04, which is an sRGB gray of
  // about #383838: brighter light than that needs no help to read as colored.
  float extra = uColorBoost * saturation * saturation / (1.0 + intensity / 0.04);
  vec3 target = fromOklab(vec3(litLab.x, litLab.yz + extra * (litLab.yz - unlitLab.yz)));

  vec3 shift = target - lit;
  shift -= vec3(dot(shift, luminanceWeights));
  vec3 allowance = mix(lit - unlit, vec3(1.0) - lit, step(vec3(0.0), shift));
  vec3 limits = allowance / max(abs(shift), vec3(0.000001));
  float amount = clamp(min(limits.r, min(limits.g, limits.b)), 0.0, 1.0);
  return clamp(lit + amount * shift, min(unlit, lit), vec3(1.0));
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
  vec2 subjectUv = (windowUv - uSubjectRect.xy) / max(uSubjectRect.zw, vec2(0.0001));
  vec2 mapUv = (subjectUv + uMapMargin) / (vec2(1.0) + 2.0 * uMapMargin);

  vec3 baseLinear = srgbToLinear(source.rgb / source.a);

  // Global mode replaces both lookups with the mean of the map, so the whole
  // model takes one color.
  vec3 surround = mix(uSurroundAverage, srgbToLinear(texture2D(uSurroundMap, mapUv).rgb), uDirectional);
  vec3 contact = mix(uContactAverage, srgbToLinear(texture2D(uContactMap, mapUv).rgb), uDirectional);

  // The model reflects the light it stands in. Its painted colors are its
  // reflectance under the painter's white light, so the screen light scales
  // them: a white screen shows the model as drawn, a dark screen dims it to
  // the floor, and a colored screen colors it.
  //
  // The level of that light comes from two places. uDisplayLevel is the mean of
  // the whole display, so the character keeps one exposure while the user drags
  // its window across the desktop. The map at this fragment supplies the rest,
  // which is what keeps the side facing a bright window brighter than the far
  // side. The tint keeps only the luminance of the map at 0, so the model then
  // follows the screen brightness with its own colors.
  //
  // Nothing here subtracts. A channel the screen lacks falls no lower than
  // uDarkBase, which stands for the light the room gives without the screen, so
  // a saturated screen cannot drain a channel out of the artwork. Strength
  // stops at 1, because more of it could only darken the model; the bands take
  // the rest.
  float effect = min(uStrength, 1.0);
  vec3 shaped = mix(vec3(dot(surround, luminanceWeights)), surround, uTint);
  vec3 incoming = mix(vec3(uDisplayLevel), shaped, uLocalShare);
  vec3 reflectance = uDarkBase + (1.0 - uDarkBase) * pow(max(incoming, vec3(0.0)), vec3(uBaseCurve));
  vec3 unlit = baseLinear * (1.0 - (1.0 - uDarkBase) * effect);
  vec3 tinted = baseLinear * mix(vec3(1.0), reflectance, effect);

  // Mixing toward the luminance keeps the amount of light, so the saturation
  // control moves the hue of the band and not its brightness.
  vec3 wrapColor = mix(vec3(dot(contact, luminanceWeights)), contact, uWrapSaturation);

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

  // The wide band is the wrap. The thin band is the backlight rim, the bright
  // line a subject shows in front of a bright plate. Both follow the light
  // behind each part of the edge, so an edge in front of a dark area stays
  // dark.
  vec3 added = wrapColor * uStrength * (wrapMask * uWrapIntensity + rimMask * uBacklight);

  // Added light compresses into the remaining headroom instead of clipping, so
  // bright texture detail under a strong wrap keeps its differences. One factor
  // covers all three channels, taken from whichever channel has the least room
  // left: compressing each channel on its own would let a bright colored wrap
  // keep its strongest channel while cutting the others, and the band would
  // turn white exactly where the screen color should show most.
  vec3 headroom = max(vec3(0.0), vec3(1.0) - tinted);
  vec3 load = added / max(headroom, vec3(0.0001));
  float peakLoad = max(load.r, max(load.g, load.b));
  float compression = peakLoad > 0.0 ? (1.0 - exp(-peakLoad)) / peakLoad : 1.0;
  vec3 litLinear = clamp(tinted + added * compression, 0.0, 1.0);

  // One boost over everything the screen contributed, measured against the
  // model as it looks with the screen switched off.
  vec3 unlitClamped = clamp(unlit, 0.0, 1.0);
  litLinear = enhanceLightColor(unlitClamped, litLinear, max(litLinear - unlitClamped, vec3(0.0)));

  gl_FragColor = vec4(linearToSrgb(litLinear) * source.a, source.a);
}
`

/** One frame of measurements that the filter turns into shader uniforms. */
export interface ScreenAmbientLightFilterUpdate {
  environment: AmbientLightEnvironment
  /**
   * Where the renderer drew its subject inside the stage window, in window
   * units. It has to be the rectangle the measurement placed its maps around,
   * or every lookup lands somewhere the light was never measured.
   *
   * Leave it out and the whole window stands in, which is what a stage with
   * nothing drawn on it reports.
   */
  subject?: NormalizedRectangle
  mode: ScreenAmbientLightMode
  strength: number
  options: AmbientLightFilterOptions
}

/**
 * Lights a Live2D model with the screen around it: the model reflects the
 * screen light over its whole body, and a light wrap and a backlight rim add
 * the light behind its silhouette.
 *
 * Each frame runs three passes. Two half-resolution passes blur the model
 * alpha, horizontally and then vertically, into a texture that holds the rim
 * band and the wrap band. The main pass then scales the model by the screen
 * light and adds the screen light inside both bands.
 *
 * The overall exposure comes from `environment.displayLuminance`, which meters
 * the whole display, while the maps shape it by position. Splitting the two
 * keeps the character at one brightness while its window moves.
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
   * Largest channel in the contact map.
   *
   * Both bands add the map light, so the early-out in `apply` only has to know
   * whether the map holds any light at all.
   */
  private contactPeak = 0
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
      uDirectional: 0,
      uStrength: 0,
      uDisplayLevel: 1,
      uDarkBase: ambientLightDefaults.filter.darkBase,
      uBaseCurve: ambientLightDefaults.filter.baseCurve,
      uLocalShare: ambientLightDefaults.filter.localShare,
      uTint: ambientLightDefaults.filter.tint,
      uColorBoost: ambientLightDefaults.filter.colorBoost,
      uWrapIntensity: ambientLightDefaults.filter.wrapIntensity,
      uWrapSaturation: ambientLightDefaults.filter.wrapSaturation,
      uTranslucentWrap: 0,
      uMapMargin: new Float32Array([ambientLightNeutralMapMargin.x, ambientLightNeutralMapMargin.y]),
      uSubjectRect: new Float32Array([0, 0, 1, 1]),
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
    this.uniforms.uMapMargin[0] = environment.mapMargin.x
    this.uniforms.uMapMargin[1] = environment.mapMargin.y
    const subject = next.subject ?? wholeWindowRectangle
    this.uniforms.uSubjectRect[0] = subject.x
    this.uniforms.uSubjectRect[1] = subject.y
    this.uniforms.uSubjectRect[2] = Math.max(subject.width, 0.0001)
    this.uniforms.uSubjectRect[3] = Math.max(subject.height, 0.0001)
    this.uniforms.uDisplayLevel = clamp(environment.displayLuminance, 0, 1)
    this.uniforms.uDarkBase = clamp(options.darkBase, 0, 1)
    this.uniforms.uBaseCurve = clamp(options.baseCurve, 0.25, 4)
    this.uniforms.uLocalShare = clamp(options.localShare, 0, 1)
    this.uniforms.uTint = clamp(options.tint, 0, 1)
    this.uniforms.uColorBoost = clamp(options.colorBoost, 0, 10)
    this.uniforms.uWrapIntensity = Math.max(0, options.wrapIntensity)
    this.uniforms.uWrapSaturation = clamp(options.wrapSaturation, 0, 1)
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

    // With no light, or with no wrap and no backlight, both bands add zero. A
    // white texture reads as fully covered, which is the same mask at no cost.
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
    const amount = (this.uniforms.uWrapIntensity as number) + (this.uniforms.uBacklight as number)
    return strength * amount * this.contactPeak > 0
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
    this.contactPeak = peakChannel(environment.contact)
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
    texels[texel * 4] = linearToSrgbByte(map.data[texel * 3])
    texels[texel * 4 + 1] = linearToSrgbByte(map.data[texel * 3 + 1])
    texels[texel * 4 + 2] = linearToSrgbByte(map.data[texel * 3 + 2])
    texels[texel * 4 + 3] = 255
  }
}
