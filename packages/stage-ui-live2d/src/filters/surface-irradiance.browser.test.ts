import { Application } from '@pixi/app'
import { BatchRenderer, Filter, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { afterAll, describe, expect, it } from 'vitest'

import { flatScreenGeometry, sampleScreenCurve, screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenGeometry, writeScreenLights } from './surface-irradiance'

extensions.add(BatchRenderer, TickerPlugin)
const app = new Application({ width: 1, height: 1, autoStart: false, backgroundAlpha: 0, preserveDrawingBuffer: true })
const sprite = new Sprite(Texture.WHITE)
app.stage.addChild(sprite)
sprite.width = 1
sprite.height = 1

afterAll(() => app.destroy(true, { children: true }))

function render(normal: number[], column: number, row = 12, position = [0.5, 0.5], geometry = flatScreenGeometry) {
  const map = { width: 24, height: 24, data: new Float32Array(24 * 24 * 3) }
  for (let y = row - 2; y < row + 2; y++) {
    for (let x = column - 2; x < column + 2; x++) map.data[(y * 24 + x) * 3] = 1
  }
  const lights = new Float32Array(screenLightCount * 3)
  writeScreenLights(map, lights)
  const emitters = new Float32Array(screenLightGridSize * 4)
  writeScreenGeometry(geometry, 1, emitters)
  const filter = new Filter(undefined, `
    precision highp float;
    uniform vec3 uNormal;
    uniform vec2 uPosition;
    uniform float u_airiStrength;
    uniform float u_airiChroma;
    uniform float u_airiDirectional;
    ${surfaceIrradianceShader}
    void main() { gl_FragColor = vec4(clamp(vec3(0.2)*airiSurfaceResponse(normalize(uNormal),uPosition),0.,1.),1.); }
  `, { uNormal: normal, uPosition: position, u_airiStrength: 1, u_airiChroma: 1, u_airiDirectional: 1, u_airiLights: lights, u_airiBounds: [0, 0, 1, 1], u_airiScreen: [-0.5, -0.5, 2, 2], u_airiFieldBounds: [0, 0, 1, 1], u_airiStageAspect: 1, u_airiEmitters: emitters })
  sprite.filters = [filter]
  app.renderer.render(app.stage)
  const gl = app.renderer.gl
  const pixel = new Uint8Array(4)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  expect(gl.getError()).toBe(gl.NO_ERROR)
  sprite.filters = []
  filter.destroy()
  return pixel
}

describe('screen plane irradiance', () => {
  it('does not shine through the front of an opaque surface from behind', () => {
    // ROOT CAUSE:
    // The first integration put all screen lights at positive Z, in front of
    // the character, so a red patch behind a face cast red onto its front.
    const pixel = render([0, 0, 1], 12)
    expect(pixel[0]).toBe(51)
    expect(pixel[1]).toBe(51)
    expect(pixel[2]).toBe(51)
  })

  it('lights the side that faces a screen patch, not the opposite side', () => {
    const facing = render([0.9, 0, 0.4], 17)
    const away = render([-0.9, 0, 0.4], 17)
    expect(facing[0]).toBeGreaterThan(away[0])
    expect(away[0]).toBe(51)
    expect(facing[1]).toBe(51)
  })

  it('weakens the same emitting area as it moves farther sideways', () => {
    const near = render([0.9, 0, 0.4], 16)
    const far = render([0.9, 0, 0.4], 21)
    expect(near[0]).toBeGreaterThan(far[0])
  })

  it('recomputes direction when the surface moves past the screen patch', () => {
    const before = render([0.9, 0, 0.4], 17, 12, [0.5, 0.5])
    const after = render([0.9, 0, 0.4], 17, 12, [1.3, 0.5])
    expect(before[0]).toBeGreaterThan(after[0])
    expect(after[0]).toBe(51)
  })

  it('treats upper screen rows as light from above', () => {
    const facing = render([0, 0.9, 0.4], 12, 7)
    const away = render([0, -0.9, 0.4], 12, 7)
    expect(facing[0]).toBeGreaterThan(away[0])
    expect(away[0]).toBe(51)
  })

  it('lets a forward-bent edge illuminate the front of the face', () => {
    const flat = render([0, 0, 1], 20)
    const curved = render([0, 0, 1], 20, 12, [0.5, 0.5], { gap: 0.04, bend: 3, flatRadius: 0.2 })
    expect(flat[0]).toBe(51)
    expect(curved[0]).toBeGreaterThan(flat[0] + 2)
    expect(curved[1]).toBe(51)
  })

  it('stays finite where a curved tile meets the surface plane', () => {
    const geometry = { gap: 0.04, bend: 3, flatRadius: 0.2 }
    const emitter = sampleScreenCurve(0.625, geometry)
    geometry.gap += emitter[1]
    const result = render([0, 0, 1], 20, 12, [emitter[0] + 0.5, 0.625], geometry)
    expect(Array.from(result)).toEqual([51, 51, 51, 255])
  })

  it('keeps the flat center behind the character even with curved edges', () => {
    const center = render([0, 0, 1], 12, 12, [0.5, 0.5], { gap: 0.04, bend: 3, flatRadius: 0.4 })
    expect(center[0]).toBe(51)
  })

  it('can move the curved emitters back behind the face by increasing the gap', () => {
    const near = render([0, 0, 1], 20, 12, [0.5, 0.5], { gap: 0.04, bend: 3, flatRadius: 0.2 })
    const behind = render([0, 0, 1], 20, 12, [0.5, 0.5], { gap: 0.8, bend: 3, flatRadius: 0.2 })
    expect(near[0]).toBeGreaterThan(behind[0])
    expect(behind[0]).toBe(51)
  })
})
