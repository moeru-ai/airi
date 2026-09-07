import type { AmbientLightMap, AmbientLightScreenGeometry } from '@proj-airi/stage-shared/screen-ambient-light'

import { ambientLightMapMargin } from '@proj-airi/stage-shared/screen-ambient-light'

/** Horizontal samples shared by each row of the emitting screen. */
export const screenLightGridSize = 8
const mapSpan = 1 + 2 * ambientLightMapMargin

/** Eight by eight finite emitting tiles over the stage and its screen margin. */
export const screenLightCount = screenLightGridSize * screenLightGridSize

/** Flat reference geometry for the original preview and shader comparisons. */
export const flatScreenGeometry: Readonly<AmbientLightScreenGeometry> = Object.freeze({ gap: 0.04, bend: 0, flatRadius: 0.2 })

/**
 * Bends a horizontal screen coordinate along a circular arc without stretching
 * its emitting area. Returns X, Z, normal X, normal Z for the inward-facing side.
 * Beyond an 85-degree turn, the edge continues along its tangent instead of
 * curling back through the character. Used by lighting and the preview diagram.
 */
export function sampleScreenCurve(x: number, geometry: AmbientLightScreenGeometry): [number, number, number, number] {
  const edge = Math.max(0, Math.abs(x) - geometry.flatRadius)
  if (geometry.bend === 0 || edge === 0)
    return [x, -geometry.gap, 0, 1]
  const arc = Math.min(edge, 1.483529864 / geometry.bend)
  const angle = arc * geometry.bend
  const tail = edge - arc
  const side = Math.sign(x)
  return [
    side * (geometry.flatRadius + Math.sin(angle) / geometry.bend + tail * Math.cos(angle)),
    -geometry.gap + (1 - Math.cos(angle)) / geometry.bend + tail * Math.sin(angle),
    -side * Math.sin(angle),
    Math.cos(angle),
  ]
}

/** Prepares finite tile positions and normals when geometry or aspect changes. */
export function writeScreenGeometry(geometry: AmbientLightScreenGeometry, aspect: number, target: Float32Array) {
  for (let i = 0; i < screenLightGridSize; i++) {
    const x = ((i + 0.5) / screenLightGridSize * mapSpan - ambientLightMapMargin - 0.5) * aspect
    target.set(sampleScreenCurve(x, geometry), i * 4)
  }
}

const integrate = Array.from({ length: screenLightCount }, (_, i) => {
  const y = (Math.floor(i / screenLightGridSize) + 0.5) / screenLightGridSize * mapSpan - ambientLightMapMargin
  return `
  irradiance += u_airiLights[${i}] * airiScreenWeight(n, stageUv, ${y.toFixed(8)}, u_airiEmitters[${i % screenLightGridSize}]);
  meanRadiance += u_airiLights[${i}] / ${screenLightCount.toFixed(1)};`
}).join('\n')

/**
 * Finite screen-plane quadrature for a normal-mapped surface in front of it.
 * Consumed by Cubism's color shader. Radiance stays linear and is not normalized
 * by the brightest source, so small or distant emitters retain their energy.
 * The final ambient filter supplies base exposure and silhouette scattering.
 */
export const surfaceIrradianceShader = `
uniform vec3 u_airiLights[${screenLightCount}];
uniform float u_airiStageAspect;
uniform vec4 u_airiEmitters[${screenLightGridSize}];
float airiScreenWeight(vec3 n, vec2 p, float emitterY, vec4 emitter) {
  vec3 delta = vec3(emitter.x-(p.x-0.5)*u_airiStageAspect, p.y-emitterY, emitter.y);
  float distanceSquared = dot(delta,delta);
  // A curved tile can intersect the surface plane; zero displacement must
  // produce zero direction rather than NaN. Tile area bounds its energy.
  vec3 direction = delta*inversesqrt(max(distanceSquared,1e-8));
  float receiverCosine = max(dot(n,direction),0.);
  float emitterCosine = max(dot(vec3(emitter.z,0.,emitter.w),-direction),0.);
  float area = ${((mapSpan / screenLightGridSize) ** 2).toFixed(8)}*u_airiStageAspect;
  // Finite tile area softens the near-field quadrature, avoiding a point-light
  // singularity. At distance this converges to area*cos(emitter)/distance^2.
  float solidAngle = area*emitterCosine/(distanceSquared+area/3.14159265);
  return receiverCosine*solidAngle/3.14159265;
}
vec3 airiSurfaceResponse(vec3 n, vec2 stageUv) {
  vec3 irradiance = vec3(0.);
  vec3 meanRadiance = vec3(0.);
  ${integrate}
  vec3 weights = vec3(0.2126,0.7152,0.0722);
  if (u_airiDirectional < 0.5) {
    float energy = dot(meanRadiance,weights);
    vec3 colorCast = min(meanRadiance/max(energy,0.0005),vec3(1.6));
    float presence = smoothstep(0.,0.04,energy);
    return mix(vec3(1.),colorCast,u_airiChroma*min(u_airiStrength,1.)*presence);
  }
  // Screen irradiance adds to the existing ambient exposure, through albedo.
  // A surface facing away from the screen gets no direct light or color cast.
  vec3 diffuse = mix(vec3(dot(irradiance,weights)),irradiance,u_airiChroma);
  return vec3(1.)+2.*u_airiStrength*diffuse;
}
`

/** Writes mean linear radiance for each emitting region of the screen. */
export function writeScreenLights(map: AmbientLightMap, target: Float32Array) {
  const { width, height, data } = map
  target.fill(0)
  // Area overlap keeps energy and source positions stable for non-divisible
  // map dimensions. It also permits small synthetic maps in renderer checks.
  for (let row = 0; row < screenLightGridSize; row++) {
    const top = row * height / screenLightGridSize
    const bottom = (row + 1) * height / screenLightGridSize
    for (let column = 0; column < screenLightGridSize; column++) {
      const left = column * width / screenLightGridSize
      const right = (column + 1) * width / screenLightGridSize
      const area = (right - left) * (bottom - top)
      const targetOffset = (row * screenLightGridSize + column) * 3
      for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
        for (let x = Math.floor(left); x < Math.ceil(right); x++) {
          const overlap = (Math.min(x + 1, right) - Math.max(x, left)) * (Math.min(y + 1, bottom) - Math.max(y, top))
          for (let c = 0; c < 3; c++) target[targetOffset + c] += data[(y * width + x) * 3 + c] * overlap / area
        }
      }
    }
  }
}
