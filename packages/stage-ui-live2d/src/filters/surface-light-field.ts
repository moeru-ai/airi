import type { Renderer } from '@pixi/core'
import type { AmbientLightMaterialOptions, AmbientLightScreenGeometry } from '@proj-airi/stage-shared/screen-ambient-light'

import type { SurfaceLightFrame } from './surface-irradiance'

import { DRAW_MODES, SCALE_MODES } from '@pixi/constants'
import { Geometry, RenderTexture, Shader, State } from '@pixi/core'

import { lightFieldLayout, referenceLightFrame, screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenEdges, writeScreenGeometry } from './surface-irradiance'

const { positions, azimuth, polar, layers, range } = lightFieldLayout
const width = positions * azimuth
const height = positions * polar * layers
const vertex = `
attribute vec2 aPosition;
void main() { gl_Position=vec4(aPosition,0.,1.); }
`
const fragment = `
precision highp float;
uniform float u_airiStrength;
uniform float u_airiChroma;
uniform float u_airiDirectional;
#define AIRI_BUILD_LIGHT_FIELD
${surfaceIrradianceShader}
void main() {
  vec2 pixel = gl_FragCoord.xy-vec2(.5);
  vec2 tile = floor(pixel/vec2(${azimuth.toFixed(1)},${polar.toFixed(1)}));
  float layer = floor(tile.y/${positions.toFixed(1)});
  vec2 p = vec2(tile.x,mod(tile.y,${positions.toFixed(1)}))/${(positions - 1).toFixed(1)};
  vec2 angle = mod(pixel,vec2(${azimuth.toFixed(1)},${polar.toFixed(1)}))/vec2(${(azimuth - 1).toFixed(1)},${(polar - 1).toFixed(1)})*vec2(6.2831853,3.14159265);
  p = u_airiFieldBounds.xy+p*u_airiFieldBounds.zw;
  angle.x -= 3.14159265;
  vec3 n = vec3(cos(angle.x)*sin(angle.y),sin(angle.x)*sin(angle.y),cos(angle.y));
  u_airiArea = layer < .5 ? 1. : 0.;
  u_airiFace = 0.;
  u_airiHair = 1.;
  airiSkinNormal = n;
  airiFaceForward = n;
  vec3 value = vec3(0.);
  for (int row=0;row<${screenLightGridSize};row++) {
    float y=airiEmitterY(float(row));
    for (int column=0;column<${screenLightGridSize};column++) {
      vec2 weight=airiScreenWeight(n,p,y,u_airiEmitters[column],u_airiEdges[column].xy,u_airiEdges[column+1].xy);
      value += u_airiLights[row*${screenLightGridSize}+column]*(layer < .5 ? weight.x : weight.y);
    }
  }
  gl_FragColor=vec4(sqrt(clamp(value/${range.toFixed(1)},0.,1.)),1.);
}
`

/**
 * Combines screen tiles into a spatial and directional radiance atlas.
 *
 * The owner calls update before drawing surfaces. New screen samples coalesce
 * until the next draw at least 50 ms after the last update. Geometry and
 * roughness changes refresh on the next draw without that delay.
 * Normals, pose, exposure, and color strength remain full-resolution inputs to
 * the reader. This cache contains no model color, bloom, or animated shadows.
 * Dispose with the owning renderer; Pixi recreates resources after context loss.
 */
export class SurfaceLightField {
  readonly bounds = new Float32Array([0, 0, 1, 1])
  readonly mean = new Float32Array(3)
  readonly texture = RenderTexture.create({ width, height, scaleMode: SCALE_MODES.LINEAR })
  private readonly geometry = new Geometry().addAttribute('aPosition', [-1, -1, 3, -1, -1, 3], 2)
  private readonly state = State.for2d()
  private readonly shader = Shader.from(vertex, fragment, {
    u_airiLights: new Float32Array(screenLightCount * 3),
    u_airiEmitters: new Float32Array(screenLightGridSize * 4),
    u_airiEdges: new Float32Array((screenLightGridSize + 1) * 4),
    u_airiStageAspect: 1,
    u_airiBounds: new Float32Array([0, 0, 1, 1]),
    u_airiScreen: new Float32Array([-0.5, -0.5, 2, 2]),
    u_airiFieldBounds: this.bounds,
    u_airiFaceShadowStrength: 0,
    u_airiIllustrated: 1,
    u_airiSkinRelief: 1,
    u_airiRoughness: 0.7,
    u_airiSheen: 1,
  })

  private configuration = ''
  private frameKey = ''
  private renderedAt = -Infinity

  /** Returns true when this draw rebuilds the combined-light atlas. */
  update(renderer: Renderer, lights: Float32Array, screen: Readonly<AmbientLightScreenGeometry>, aspect: number, material: Readonly<AmbientLightMaterialOptions>, now = performance.now(), frame: Readonly<SurfaceLightFrame> = referenceLightFrame) {
    const configuration = `${screen.gap},${screen.bend},${screen.flatRadius},${aspect},${material.roughness},${material.illustrated},${renderer.CONTEXT_UID}`
    const { character, screen: display } = frame
    const frameKey = `${character.x},${character.y},${character.width},${character.height},${display.x},${display.y},${display.width},${display.height}`
    const frameChanged = frameKey !== this.frameKey
    const geometryChanged = configuration !== this.configuration
    const previous = this.shader.uniforms.u_airiLights as Float32Array
    if (!geometryChanged && (now - this.renderedAt < 50 || (!frameChanged && lights.every((value, i) => value === previous[i]))))
      return false
    previous.set(lights)
    this.mean.fill(0)
    for (let i = 0; i < lights.length; i++) this.mean[i % 3] += lights[i] / screenLightCount
    if (geometryChanged || frameChanged) {
      this.shader.uniforms.u_airiBounds.set([character.x, character.y, character.width, character.height])
      this.shader.uniforms.u_airiScreen.set([display.x, display.y, display.width, display.height])
      // Keep the lookup lattice attached to the full model too. Resampling
      // that lattice to each viewport crop shifts grazing-light boundaries,
      // even when the physical emitter positions remain identical.
      this.bounds.set([character.x, character.y, character.width, character.height])
      writeScreenGeometry(screen, aspect, this.shader.uniforms.u_airiEmitters, frame)
      writeScreenEdges(screen, aspect, this.shader.uniforms.u_airiEdges, frame)
      this.shader.uniforms.u_airiStageAspect = aspect
      this.shader.uniforms.u_airiRoughness = material.roughness
      this.shader.uniforms.u_airiIllustrated = material.illustrated ? 1 : 0
    }
    // Use Pixi's existing offscreen pass and state owners. Restore the enclosing
    // filter frame so this cache never changes the character's stage coordinates.
    const target = renderer.renderTexture.current
    const source = renderer.renderTexture.sourceFrame.clone()
    const destination = renderer.renderTexture.destinationFrame.clone()
    const transform = renderer.projection.transform
    renderer.batch.flush()
    try {
      renderer.projection.transform = null
      renderer.renderTexture.bind(this.texture)
      renderer.state.set(this.state)
      renderer.shader.bind(this.shader)
      renderer.geometry.bind(this.geometry, this.shader)
      renderer.geometry.draw(DRAW_MODES.TRIANGLES, 3)
    }
    finally {
      renderer.projection.transform = transform
      renderer.renderTexture.bind(target, source, destination)
    }
    this.frameKey = frameKey
    this.configuration = configuration
    this.renderedAt = now
    return true
  }

  /** Releases only this cache's resources. */
  dispose() {
    this.texture.destroy(true)
    this.geometry.destroy()
    this.shader.destroy()
  }
}
