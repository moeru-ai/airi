import type { AmbientLightMap } from '@proj-airi/stage-shared/screen-ambient-light'

import { ambientLightMapMargin } from '@proj-airi/stage-shared/screen-ambient-light'

const gridSize = 8

/** Eight by eight finite emitting tiles over the stage and its screen margin. */
export const screenLightCount = gridSize * gridSize

// Coordinates use stage height as the world unit, with +Z toward the viewer.
// The character is a normal-mapped surface 4% of a window height off the screen.
const screenDistance = 0.04
const mapSpan = 1 + 2 * ambientLightMapMargin
const integrate = Array.from({ length: screenLightCount }, (_, i) => {
  const x = (i % gridSize + 0.5) / gridSize * mapSpan - ambientLightMapMargin
  const y = (Math.floor(i / gridSize) + 0.5) / gridSize * mapSpan - ambientLightMapMargin
  return `
  irradiance += u_airiLights[${i}] * airiScreenWeight(n, stageUv, vec2(${x.toFixed(8)}, ${y.toFixed(8)}));
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
float airiScreenWeight(vec3 n, vec2 p, vec2 emitter) {
  vec3 delta = vec3((emitter.x-p.x)*u_airiStageAspect, p.y-emitter.y, -${screenDistance});
  float distanceSquared = dot(delta,delta);
  vec3 direction = delta*inversesqrt(distanceSquared);
  float receiverCosine = max(dot(n,direction),0.);
  float emitterCosine = max(-direction.z,0.);
  float area = ${((mapSpan / gridSize) ** 2).toFixed(8)}*u_airiStageAspect;
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
  for (let row = 0; row < gridSize; row++) {
    const top = row * height / gridSize
    const bottom = (row + 1) * height / gridSize
    for (let column = 0; column < gridSize; column++) {
      const left = column * width / gridSize
      const right = (column + 1) * width / gridSize
      const area = (right - left) * (bottom - top)
      const targetOffset = (row * gridSize + column) * 3
      for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
        for (let x = Math.floor(left); x < Math.ceil(right); x++) {
          const overlap = (Math.min(x + 1, right) - Math.max(x, left)) * (Math.min(y + 1, bottom) - Math.max(y, top))
          for (let c = 0; c < 3; c++) target[targetOffset + c] += data[(y * width + x) * 3 + c] * overlap / area
        }
      }
    }
  }
}
