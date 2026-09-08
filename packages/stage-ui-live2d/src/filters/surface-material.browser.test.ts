import { Application } from '@pixi/app'
import { BatchRenderer, Filter, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { afterAll, describe, expect, it } from 'vitest'

import { screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenGeometry, writeScreenLights } from './surface-irradiance'

extensions.add(BatchRenderer, TickerPlugin)
const app = new Application({ width: 1, height: 1, autoStart: false, backgroundAlpha: 0, preserveDrawingBuffer: true })
const sprite = new Sprite(Texture.WHITE)
app.stage.addChild(sprite)
afterAll(() => app.destroy(true, { children: true }))

function render({ sheen = 1, ambient = 0.5, strength = 2, soft = true, albedo = 0, bend = 3.5, normal = [-0.4, 0, 0.9165], light = 1 } = {}) {
  const map = { width: 24, height: 24, data: new Float32Array(24 * 24 * 3) }
  for (let y = 8; y < 16; y++) {
    for (let x = 2; x < 6; x++) map.data[(y * 24 + x) * 3] = light
  }
  const lights = new Float32Array(screenLightCount * 3)
  const emitters = new Float32Array(screenLightGridSize * 4)
  writeScreenLights(map, lights)
  writeScreenGeometry({ bend, gap: 0.02, flatRadius: 0.05 }, 1, emitters)
  const filter = new Filter(undefined, `
    precision highp float;
    uniform vec3 uNormal;
    uniform float uAlbedo;
    uniform float u_airiStrength;
    uniform float u_airiChroma;
    uniform float u_airiDirectional;
    ${surfaceIrradianceShader}
    void main() { gl_FragColor = vec4(airiSurfaceColor(normalize(uNormal),vec2(0.5),vec3(uAlbedo),1.),1.); }
  `, { uNormal: normal, uAlbedo: albedo, u_airiStrength: strength, u_airiChroma: 1, u_airiDirectional: 1, u_airiLights: lights, u_airiStageAspect: 1, u_airiEmitters: emitters, u_airiSheen: sheen, u_airiSoftHighlights: soft ? 1 : 0, u_airiAmbient: ambient, u_airiContrast: 1 })
  sprite.filters = [filter]
  app.render()
  const gl = app.renderer.gl
  const pixel = new Uint8Array(4)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  expect(gl.getError()).toBe(0)
  sprite.filters = []
  filter.destroy()
  return Array.from(pixel)
}

describe('surface material response', () => {
  it('reflects source color independently of the painted albedo', () => {
    const matte = render({ sheen: 0 })
    const shiny = render()
    expect(matte[0]).toBe(0)
    expect(shiny[0]).toBeGreaterThan(0)
    expect(shiny[1]).toBe(0)
    expect(shiny[3]).toBe(255)
  })

  it('does not dim reflected light when ambient fill is lowered', () => {
    expect(render({ ambient: 0.1 })).toEqual(render({ ambient: 1 }))
  })

  it('keeps zero-strength artwork exact and rejects reflection from behind', () => {
    expect(render({ strength: 0, albedo: 0.2 })).toEqual([51, 51, 51, 255])
    expect(render({ bend: 0, normal: [0, 0, 1] })).toEqual([0, 0, 0, 255])
  })

  it('compresses added light while leaving an unlit surface unchanged', () => {
    const soft = render({ albedo: 0.7, soft: true })
    const hard = render({ albedo: 0.7, soft: false })
    expect(soft[0]).toBeLessThan(hard[0])
    expect(render({ albedo: 0.2, light: 0, ambient: 1 })).toEqual([51, 51, 51, 255])
  })
})
