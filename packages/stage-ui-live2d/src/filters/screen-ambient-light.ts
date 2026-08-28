import type {
  Live2DAmbientLightDirection,
  Live2DAmbientLightFilterOptions,
  Live2DAmbientLightLobe,
  Live2DAmbientLightSample,
  Live2DScreenAmbientLightMode,
} from '../stores/ambient-light'

import { Filter } from '@pixi/core'

import { live2dAmbientLightDefaults } from '../stores/ambient-light'

const fragmentShader = `
varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform vec3 uAmbientColor;
uniform vec2 uLightDirection;
uniform vec3 uLobeColor0;
uniform vec3 uLobeColor1;
uniform vec3 uLobeColor2;
uniform vec2 uLobeDirection0;
uniform vec2 uLobeDirection1;
uniform vec2 uLobeDirection2;
uniform float uLobeIntensity0;
uniform float uLobeIntensity1;
uniform float uLobeIntensity2;
uniform float uLobeCoverage0;
uniform float uLobeCoverage1;
uniform float uLobeCoverage2;
uniform float uDirectional;
uniform float uSurfaceAspect;
uniform float uStrength;
uniform float uBaseBrightness;
uniform float uBaseContrast;
uniform float uTintCoverage;
uniform float uHighlightCoverage;
uniform float uTintStrength;
uniform float uHighlightStrength;
uniform float uSourceBalance;

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

float facingBand(float projection, float coverage) {
  float distanceFromFacingEdge = (1.0 - projection) * 0.5;
  return 1.0 - smoothstep(0.0, max(coverage, 0.001), distanceFromFacingEdge);
}

float coverageDistance(vec2 direction, float aspect, float coverage) {
  float horizontalWeight = abs(direction.x) * aspect;
  float verticalWeight = abs(direction.y);
  float weightTotal = max(horizontalWeight + verticalWeight, 0.0001);
  float largerWeight = max(horizontalWeight, verticalWeight) / weightTotal;
  float smallerWeight = min(horizontalWeight, verticalWeight) / weightTotal;
  float normalizedCoverage = clamp(coverage, 0.0, 1.0);

  if (smallerWeight < 0.0001) {
    return normalizedCoverage;
  }

  // The projection of a rectangle forms a weighted triangular distribution.
  // This inverse CDF keeps the illuminated area stable as the angle changes.
  float transitionCoverage = smallerWeight / (2.0 * largerWeight);
  if (normalizedCoverage < transitionCoverage) {
    return sqrt(2.0 * largerWeight * smallerWeight * normalizedCoverage);
  }
  if (normalizedCoverage <= 1.0 - transitionCoverage) {
    return largerWeight * normalizedCoverage + smallerWeight * 0.5;
  }
  return 1.0 - sqrt(
    2.0 * largerWeight * smallerWeight * (1.0 - normalizedCoverage)
  );
}

vec3 lightContribution(
  vec3 baseLinear,
  float midtoneResponse,
  vec2 localPosition,
  vec3 lightColor,
  vec2 lightDirection,
  float intensity,
  float tintCoverage,
  float highlightCoverage
) {
  vec2 direction = lightDirection;
  float directionLength = length(direction);
  float directional = uDirectional * step(0.0001, directionLength);
  direction /= max(directionLength, 0.0001);

  float maximumProjection = 0.5 * (
    abs(direction.x) * uSurfaceAspect + abs(direction.y)
  );
  float projection = clamp(
    dot(localPosition, direction) / max(maximumProjection, 0.0001),
    -1.0,
    1.0
  );
  float tintDistance = coverageDistance(direction, uSurfaceAspect, tintCoverage);
  float highlightDistance = coverageDistance(direction, uSurfaceAspect, highlightCoverage);
  float tintMask = mix(1.0, facingBand(projection, tintDistance), directional);
  float highlightMask = mix(1.0, facingBand(projection, highlightDistance), directional);
  vec3 lightLinear = srgbToLinear(lightColor);
  vec3 diffuseLight = baseLinear * lightLinear * uTintStrength * tintMask;
  vec3 fillLight = lightLinear * midtoneResponse * uHighlightStrength * highlightMask;
  return (diffuseLight + fillLight) * intensity;
}

void main(void) {
  vec4 source = texture2D(uSampler, vTextureCoord);
  if (source.a <= 0.0) {
    gl_FragColor = source;
    return;
  }

  vec2 localPosition = vec2(
    (vTextureCoord.x - 0.5) * uSurfaceAspect,
    vTextureCoord.y - 0.5
  );
  vec3 base = source.rgb / source.a;
  vec3 baseLinear = srgbToLinear(base);
  float baseResponseStrength = min(uStrength, 1.0);
  float baseBrightness = mix(1.0, uBaseBrightness, baseResponseStrength);
  float baseContrast = mix(1.0, uBaseContrast, baseResponseStrength);
  vec3 exposedBaseLinear = pow(baseLinear, vec3(baseContrast)) * baseBrightness;
  float baseLuminance = dot(baseLinear, vec3(0.2126, 0.7152, 0.0722));
  float midtoneResponse = 4.0 * baseLuminance * (1.0 - baseLuminance);
  float sourceIntensityTotal = uLobeIntensity0 + uLobeIntensity1 + uLobeIntensity2;
  float hasSources = step(0.0001, sourceIntensityTotal);
  float ambientWeight = mix(1.0, 2.0 * (1.0 - uSourceBalance), hasSources);
  float sourceWeight = 2.0 * uSourceBalance;
  vec3 addedLight = lightContribution(
    baseLinear,
    midtoneResponse,
    localPosition,
    uAmbientColor,
    uLightDirection,
    ambientWeight,
    uTintCoverage,
    uHighlightCoverage
  );
  addedLight += lightContribution(
    baseLinear,
    midtoneResponse,
    localPosition,
    uLobeColor0,
    uLobeDirection0,
    uLobeIntensity0 * sourceWeight,
    mix(uTintCoverage * 0.5, 1.0, uLobeCoverage0),
    uLobeCoverage0
  );
  addedLight += lightContribution(
    baseLinear,
    midtoneResponse,
    localPosition,
    uLobeColor1,
    uLobeDirection1,
    uLobeIntensity1 * sourceWeight,
    mix(uTintCoverage * 0.5, 1.0, uLobeCoverage1),
    uLobeCoverage1
  );
  addedLight += lightContribution(
    baseLinear,
    midtoneResponse,
    localPosition,
    uLobeColor2,
    uLobeDirection2,
    uLobeIntensity2 * sourceWeight,
    mix(uTintCoverage * 0.5, 1.0, uLobeCoverage2),
    uLobeCoverage2
  );
  addedLight *= uStrength;
  vec3 headroom = max(vec3(0.0), vec3(1.0) - exposedBaseLinear);
  vec3 compressedLight = headroom * (
    vec3(1.0) - exp(-addedLight / max(headroom, vec3(0.0001)))
  );
  vec3 litLinear = clamp(exposedBaseLinear + compressedLight, 0.0, 1.0);
  vec3 lit = linearToSrgb(litLinear);

  gl_FragColor = vec4(lit * source.a, source.a);
}
`

/** Applies additive screen-derived light to a Live2D model. */
export class ScreenAmbientLightFilter extends Filter {
  private readonly ambientColor = new Float32Array([0, 0, 0])
  private readonly lightDirection = new Float32Array([0, 0])
  private readonly lobeColors = [
    new Float32Array([0, 0, 0]),
    new Float32Array([0, 0, 0]),
    new Float32Array([0, 0, 0]),
  ]

  private readonly lobeDirections = [
    new Float32Array([0, 0]),
    new Float32Array([0, 0]),
    new Float32Array([0, 0]),
  ]

  constructor() {
    super(undefined, fragmentShader, {
      uAmbientColor: new Float32Array([0, 0, 0]),
      uLightDirection: new Float32Array([0, 0]),
      uLobeColor0: new Float32Array([0, 0, 0]),
      uLobeColor1: new Float32Array([0, 0, 0]),
      uLobeColor2: new Float32Array([0, 0, 0]),
      uLobeDirection0: new Float32Array([0, 0]),
      uLobeDirection1: new Float32Array([0, 0]),
      uLobeDirection2: new Float32Array([0, 0]),
      uLobeIntensity0: 0,
      uLobeIntensity1: 0,
      uLobeIntensity2: 0,
      uLobeCoverage0: 0,
      uLobeCoverage1: 0,
      uLobeCoverage2: 0,
      uDirectional: 0,
      uSurfaceAspect: 1,
      uStrength: 0,
      uBaseBrightness: live2dAmbientLightDefaults.filter.baseBrightness,
      uBaseContrast: live2dAmbientLightDefaults.filter.baseContrast,
      uTintCoverage: live2dAmbientLightDefaults.filter.tintCoverage,
      uHighlightCoverage: live2dAmbientLightDefaults.filter.highlightCoverage,
      uTintStrength: live2dAmbientLightDefaults.filter.tintStrength,
      uHighlightStrength: live2dAmbientLightDefaults.filter.highlightStrength,
      uSourceBalance: live2dAmbientLightDefaults.filter.sourceBalance,
    })
  }

  /** Updates the fill and bright-source lobes without replacing the Pixi filter. */
  update(
    sample: Live2DAmbientLightSample,
    direction: Live2DAmbientLightDirection,
    lobes: readonly Live2DAmbientLightLobe[],
    mode: Live2DScreenAmbientLightMode,
    strength: number,
    options: Live2DAmbientLightFilterOptions,
    surfaceAspect: number,
  ) {
    updateColor(this.ambientColor, sample)
    this.lightDirection[0] = direction.x
    this.lightDirection[1] = direction.y
    this.uniforms.uAmbientColor = this.ambientColor
    this.uniforms.uLightDirection = this.lightDirection
    for (let index = 0; index < this.lobeColors.length; index += 1)
      this.updateLobe(index, lobes[index])
    this.uniforms.uDirectional = mode === 'window-gradient' ? 1 : 0
    this.uniforms.uSurfaceAspect = Math.max(0.001, surfaceAspect)
    this.uniforms.uStrength = Math.min(3, Math.max(0, strength))
    this.uniforms.uBaseBrightness = Math.min(1, Math.max(0, options.baseBrightness))
    this.uniforms.uBaseContrast = Math.min(2, Math.max(0.5, options.baseContrast))
    this.uniforms.uTintCoverage = options.tintCoverage
    this.uniforms.uHighlightCoverage = options.highlightCoverage
    this.uniforms.uTintStrength = options.tintStrength
    this.uniforms.uHighlightStrength = options.highlightStrength
    this.uniforms.uSourceBalance = clamp(options.sourceBalance, 0, 1)
  }

  private updateLobe(index: number, lobe?: Live2DAmbientLightLobe) {
    const color = this.lobeColors[index]
    const direction = this.lobeDirections[index]
    if (lobe) {
      updateColor(color, lobe.sample)
      direction[0] = lobe.direction.x
      direction[1] = lobe.direction.y
    }
    else {
      color.fill(0)
      direction.fill(0)
    }

    this.uniforms[`uLobeColor${index}`] = color
    this.uniforms[`uLobeDirection${index}`] = direction
    this.uniforms[`uLobeIntensity${index}`] = lobe ? clamp(lobe.intensity, 0, 1) : 0
    this.uniforms[`uLobeCoverage${index}`] = lobe ? clamp(lobe.coverage, 0.001, 1) : 0
  }
}

function updateColor(target: Float32Array, sample: Live2DAmbientLightSample) {
  target[0] = sample.red
  target[1] = sample.green
  target[2] = sample.blue
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
