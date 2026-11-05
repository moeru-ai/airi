import { Application } from '@pixi/app'
import { BatchRenderer, Filter, RenderTexture, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { afterAll, describe, expect, it } from 'vitest'

import { screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenEdges, writeScreenGeometry } from './surface-irradiance'
import { SurfaceLightField } from './surface-light-field'

extensions.add(BatchRenderer, TickerPlugin)
const app = new Application({ width: 1, height: 1, autoStart: false, backgroundAlpha: 0, preserveDrawingBuffer: true })
const sprite = app.stage.addChild(new Sprite(Texture.WHITE))
const field = new SurfaceLightField()
const lights = new Float32Array(screenLightCount * 3)
const emitters = new Float32Array(screenLightGridSize * 4)
const edges = new Float32Array((screenLightGridSize + 1) * 4)
const material = { ...ambientLightDefaults.material, illustrated: true, roughness: 0.7, sheen: 1 }
const geometry = { gap: 0.06, bend: 1.7, flatRadius: 0.11, areaLights: true }
const filter = new Filter(undefined, `
precision highp float;
uniform vec3 uNormal;
uniform vec2 uPosition;
uniform float uSpecular;
uniform float u_airiStrength;
uniform float u_airiChroma;
uniform float u_airiDirectional;
${surfaceIrradianceShader}
void main() {
  vec3 n=normalize(uNormal);
  airiSkinNormal=n;
  airiFaceForward=n;
  vec3 sheen;
  vec3 colorCast;
  vec3 diffuse=(airiSurfaceResponseWithSheen(n,uPosition,sheen,colorCast)-1.)*.5;
  gl_FragColor=vec4(mix(diffuse,sheen,uSpecular),1.);
}
`, {
  uNormal: [0, 0, 1],
  uPosition: [0.5, 0.5],
  uSpecular: 0,
  u_airiStrength: 1,
  u_airiChroma: 1,
  u_airiDirectional: 1,
  u_airiLights: lights,
  u_airiBounds: [0, 0, 1, 1],
  u_airiScreen: [-0.5, -0.5, 2, 2],
  u_airiFieldBounds: [0, 0, 1, 1],
  u_airiStageAspect: 0.815,
  u_airiEmitters: emitters,
  u_airiEdges: edges,
  u_airiArea: 1,
  u_airiFieldEnabled: 0,
  u_airiField: field.texture,
  u_airiFaceShadowStrength: 0,
  u_airiFaceHeight: 0.2,
  u_airiFaceShadow: Texture.EMPTY,
  u_airiIllustrated: 1,
  u_airiHair: 1,
  u_airiFace: 0,
  u_airiSheen: 1,
  u_airiRoughness: 0.7,
  u_airiSkinRelief: 1,
})
sprite.filters = [filter]
let time = 0
function update() {
  writeScreenGeometry(geometry, 0.815, emitters)
  writeScreenEdges(geometry, 0.815, edges)
  field.update(app.renderer, lights, geometry, 0.815, material, time += 100)
}
function render(cached: boolean, position: number[], normal: number[], specular = false) {
  filter.uniforms.u_airiFieldEnabled = cached ? 1 : 0
  filter.uniforms.uPosition = position
  filter.uniforms.uNormal = normal
  filter.uniforms.uSpecular = specular ? 1 : 0
  app.render()
  const gl = app.renderer.gl
  const pixel = new Uint8Array(4)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  expect(gl.getError()).toBe(gl.NO_ERROR)
  return Array.from(pixel.slice(0, 3), value => value / 255)
}
afterAll(() => {
  field.dispose()
  app.destroy(true, { children: true })
  filter.destroy()
})

describe('combined screen light field', () => {
  it('tracks the area reference across surface positions, directions, and screen colors', () => {
    // ROOT CAUSE:
    // The full-resolution area shader repeats 64 polygon integrals per pixel.
    // Caching by position alone would flatten the face during head turns. This
    // comparison varies both position and normal against the original shader.
    for (const color of [[1, 1, 1], [1, 0.22, 0.03], [0.025, 0.01, 0.003]]) {
      for (let i = 0; i < screenLightCount; i++) lights.set(color, i * 3)
      update()
      for (const position of [[0.2, 0.25], [0.5, 0.5], [0.8, 0.75]]) {
        for (const normal of [[0, 0, 1], [0.8, 0.15, 0.6], [-0.8, -0.15, 0.6], [0.2, 0.1, -1]]) {
          const reference = render(false, position, normal)
          const cached = render(true, position, normal)
          for (let channel = 0; channel < 3; channel++)
            expect(Math.abs(cached[channel] - reference[channel])).toBeLessThan(0.05)
        }
      }
    }
  })

  it('keeps colored highlights for hair, face, and cloth', () => {
    for (let i = 0; i < screenLightCount; i++) lights.set([0.03, 0.2, 1], i * 3)
    update()
    for (const [face, hair] of [[0, 1], [1, 0], [0, 0]]) {
      filter.uniforms.u_airiFace = face
      filter.uniforms.u_airiHair = hair
      const reference = render(false, [0.25, 0.4], [-0.6, 0, 0.8], true)
      const cached = render(true, [0.25, 0.4], [-0.6, 0, 0.8], true)
      for (let channel = 0; channel < 3; channel++)
        expect(Math.abs(cached[channel] - reference[channel]), JSON.stringify({ face, hair, cached, reference })).toBeLessThan(0.03)
      expect(cached[2]).toBeGreaterThanOrEqual(cached[0])
    }
    filter.uniforms.u_airiFace = 0
    filter.uniforms.u_airiHair = 1
  })

  it('keeps the front-facing pole continuous with adjacent normals', () => {
    lights.fill(1)
    const curved = { ...geometry, bend: 3 }
    field.update(app.renderer, lights, curved, 0.815, material, time += 100)
    const center = render(true, [0.5, 0.5], [0, 0, 1])
    const adjacent = render(true, [0.5, 0.5], [0.00001, 0, 1])
    expect(Math.abs(center[0] - adjacent[0])).toBeLessThan(1 / 255)
  })

  it('preserves different colors from opposite sides of the screen', () => {
    for (let i = 0; i < screenLightCount; i++) lights.set(i % screenLightGridSize < 4 ? [1, 0.02, 0] : [0, 0.05, 1], i * 3)
    update()
    const left = render(true, [0.5, 0.5], [-0.9, 0, 0.4])
    const right = render(true, [0.5, 0.5], [0.9, 0, 0.4])
    expect(left[0]).toBeGreaterThan(left[2])
    expect(right[2]).toBeGreaterThan(right[0])
    for (const normal of [[-0.9, 0, 0.4], [0.9, 0, 0.4]]) {
      const reference = render(false, [0.5, 0.5], normal)
      const cached = render(true, [0.5, 0.5], normal)
      for (let channel = 0; channel < 3; channel++)
        expect(Math.abs(cached[channel] - reference[channel])).toBeLessThan(0.05)
    }
  })

  it('updates animated face shadow visibility without rebuilding the light field', () => {
    lights.fill(1)
    update()
    filter.uniforms.u_airiFace = 1
    filter.uniforms.u_airiHair = 0
    filter.uniforms.u_airiFaceShadowStrength = 0.5
    try {
      const lit = render(true, [0.25, 0.4], [-0.6, 0, 0.8])
      filter.uniforms.u_airiFaceShadow = Texture.WHITE
      const shadowed = render(true, [0.25, 0.4], [-0.6, 0, 0.8])
      const reference = render(false, [0.25, 0.4], [-0.6, 0, 0.8])
      expect(lit[0] - shadowed[0]).toBeGreaterThan(0.01)
      expect(Math.abs(shadowed[0] - reference[0])).toBeLessThan(0.05)
    }
    finally {
      filter.uniforms.u_airiFace = 0
      filter.uniforms.u_airiHair = 1
      filter.uniforms.u_airiFaceShadowStrength = 0
      filter.uniforms.u_airiFaceShadow = Texture.EMPTY
    }
  })

  it('preserves sharp reflections instead of sampling them from coarse angular nodes', () => {
    lights.fill(1)
    update()
    filter.uniforms.u_airiRoughness = 0.3
    try {
      const reference = render(false, [0.25, 0.4], [-0.6, 0, 0.8], true)
      const cached = render(true, [0.25, 0.4], [-0.6, 0, 0.8], true)
      expect(cached).toEqual(reference)
    }
    finally {
      filter.uniforms.u_airiRoughness = 0.7
    }
  })

  it('restores the enclosing render target and viewport after a cache update', () => {
    const target = RenderTexture.create({ width: 8, height: 12 })
    app.renderer.renderTexture.bind(target)
    const gl = app.renderer.gl
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING)
    const viewport = Array.from(gl.getParameter(gl.VIEWPORT))
    try {
      field.update(app.renderer, lights, geometry, 0.815, { ...material, roughness: 0.6 }, time += 100)
      expect(app.renderer.renderTexture.current).toBe(target)
      expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(framebuffer)
      expect(Array.from(gl.getParameter(gl.VIEWPORT))).toEqual(viewport)
      expect(gl.getError()).toBe(gl.NO_ERROR)
    }
    finally {
      app.renderer.renderTexture.bind(null)
      target.destroy(true)
    }
  })

  it('coalesces capture updates but refreshes geometry and material changes immediately', () => {
    lights.fill(0.3)
    update()
    expect(field.update(app.renderer, lights, geometry, 0.815, material, time + 100)).toBe(false)
    lights.fill(0.8)
    expect(field.update(app.renderer, lights, geometry, 0.815, material, time + 10)).toBe(false)
    expect(field.update(app.renderer, lights, geometry, 0.815, material, time + 50)).toBe(true)
    expect(field.update(app.renderer, lights, { ...geometry, bend: 0 }, 0.815, material, time + 51)).toBe(true)
    expect(field.update(app.renderer, lights, geometry, 0.815, { ...material, roughness: 0.4 }, time + 52)).toBe(true)
  })
})
