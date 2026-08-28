import type {
  Live2DAmbientLightDirection,
  Live2DAmbientLightFilterOptions,
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
uniform float uDirectional;
uniform float uSurfaceAspect;
uniform float uStrength;
uniform float uBaseBrightness;
uniform float uBaseContrast;
uniform float uTintCoverage;
uniform float uHighlightCoverage;
uniform float uTintStrength;
uniform float uHighlightStrength;

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

void main(void) {
  vec4 source = texture2D(uSampler, vTextureCoord);
  if (source.a <= 0.0) {
    gl_FragColor = source;
    return;
  }

  vec2 direction = uLightDirection;
  float directionLength = length(direction);
  float directional = uDirectional * step(0.0001, directionLength);
  direction /= max(directionLength, 0.0001);

  vec2 localPosition = vec2(
    (vTextureCoord.x - 0.5) * uSurfaceAspect,
    vTextureCoord.y - 0.5
  );
  float maximumProjection = 0.5 * (
    abs(direction.x) * uSurfaceAspect + abs(direction.y)
  );
  float projection = clamp(
    dot(localPosition, direction) / max(maximumProjection, 0.0001),
    -1.0,
    1.0
  );

  float tintDistance = coverageDistance(direction, uSurfaceAspect, uTintCoverage);
  float highlightDistance = coverageDistance(direction, uSurfaceAspect, uHighlightCoverage);
  float tintMask = mix(1.0, facingBand(projection, tintDistance), directional);
  float highlightMask = mix(1.0, facingBand(projection, highlightDistance), directional);

  vec3 base = source.rgb / source.a;
  vec3 baseLinear = srgbToLinear(base);
  vec3 ambientLinear = srgbToLinear(uAmbientColor);
  float baseBrightness = mix(1.0, uBaseBrightness, uStrength);
  float baseContrast = mix(1.0, uBaseContrast, uStrength);
  vec3 exposedBaseLinear = pow(baseLinear, vec3(baseContrast)) * baseBrightness;
  vec3 diffuseLight = baseLinear * ambientLinear * uTintStrength * tintMask;
  float baseLuminance = dot(baseLinear, vec3(0.2126, 0.7152, 0.0722));
  float midtoneResponse = 4.0 * baseLuminance * (1.0 - baseLuminance);
  vec3 fillLight = ambientLinear * midtoneResponse * uHighlightStrength * highlightMask;
  vec3 addedLight = (diffuseLight + fillLight) * uStrength;
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

  constructor() {
    super(undefined, fragmentShader, {
      uAmbientColor: new Float32Array([0, 0, 0]),
      uLightDirection: new Float32Array([0, 0]),
      uDirectional: 0,
      uSurfaceAspect: 1,
      uStrength: 0,
      uBaseBrightness: live2dAmbientLightDefaults.filter.baseBrightness,
      uBaseContrast: live2dAmbientLightDefaults.filter.baseContrast,
      uTintCoverage: live2dAmbientLightDefaults.filter.tintCoverage,
      uHighlightCoverage: live2dAmbientLightDefaults.filter.highlightCoverage,
      uTintStrength: live2dAmbientLightDefaults.filter.tintStrength,
      uHighlightStrength: live2dAmbientLightDefaults.filter.highlightStrength,
    })
  }

  /** Updates the light color, direction, and response without replacing the Pixi filter. */
  update(
    sample: Live2DAmbientLightSample,
    direction: Live2DAmbientLightDirection,
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
    this.uniforms.uDirectional = mode === 'window-gradient' ? 1 : 0
    this.uniforms.uSurfaceAspect = Math.max(0.001, surfaceAspect)
    this.uniforms.uStrength = Math.min(1, Math.max(0, strength))
    this.uniforms.uBaseBrightness = Math.min(1, Math.max(0, options.baseBrightness))
    this.uniforms.uBaseContrast = Math.min(2, Math.max(0.5, options.baseContrast))
    this.uniforms.uTintCoverage = options.tintCoverage
    this.uniforms.uHighlightCoverage = options.highlightCoverage
    this.uniforms.uTintStrength = options.tintStrength
    this.uniforms.uHighlightStrength = options.highlightStrength
  }
}

function updateColor(target: Float32Array, sample: Live2DAmbientLightSample) {
  target[0] = sample.red
  target[1] = sample.green
  target[2] = sample.blue
}
