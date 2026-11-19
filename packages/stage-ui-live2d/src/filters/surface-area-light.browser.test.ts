import { Application } from '@pixi/app'
import { BatchRenderer, Filter, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { afterAll, describe, expect, it } from 'vitest'

import { screenLightCount, screenLightGridSize, surfaceIrradianceShader, writeScreenGeometry } from './surface-irradiance'

extensions.add(BatchRenderer, TickerPlugin)
const app = new Application({ width: 1, height: 1, autoStart: false, backgroundAlpha: 0, preserveDrawingBuffer: true })
const sprite = app.stage.addChild(new Sprite(Texture.WHITE))
const geometry = { gap: 0.04, bend: 0, flatRadius: 0.2 }
const emitters = new Float32Array(screenLightGridSize * 4)
writeScreenGeometry(geometry, 1, emitters)
const edges = new Float32Array((screenLightGridSize + 1) * 4)
for (let i = 0; i <= screenLightGridSize; i++) edges.set([i * 2 / screenLightGridSize - 1, -geometry.gap, 0, 0], i * 4)
const filter = new Filter(undefined, `
  precision highp float;
  uniform vec3 uNormal;
  uniform vec2 uPosition;
  uniform float u_airiStrength;
  uniform float u_airiChroma;
  uniform float u_airiDirectional;
  ${surfaceIrradianceShader}
  void main() { gl_FragColor=vec4((airiSurfaceResponse(normalize(uNormal),uPosition)-1.)*.5,1.); }
`, { uNormal: [0, 0, -1], uPosition: [0.5, 0.5], u_airiStrength: 1, u_airiChroma: 1, u_airiDirectional: 1, u_airiLights: new Float32Array(screenLightCount * 3).fill(1), u_airiBounds: [0, 0, 1, 1], u_airiScreen: [-0.5, -0.5, 2, 2], u_airiFieldBounds: [0, 0, 1, 1], u_airiStageAspect: 1, u_airiEmitters: emitters, u_airiEdges: edges, u_airiArea: 1 })
sprite.filters = [filter]
afterAll(() => {
  app.destroy(true, { children: true })
  filter.destroy()
})
function render(y: number, normal = [0, 0, -1]) {
  filter.uniforms.uPosition = [0.5, y]
  filter.uniforms.uNormal = normal
  app.render()
  const gl = app.renderer.gl
  const pixel = new Uint8Array(4)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  expect(gl.getError()).toBe(gl.NO_ERROR)
  return pixel[0]
}

describe('finite screen area integration', () => {
  it('keeps a nearby uniform screen continuous between tile centers', () => {
    // ROOT CAUSE:
    // One direction per tile creates separate lobes even for a uniform screen.
    // A large nearby panel covers almost the entire receiving hemisphere.
    const values = [0.5, 0.53125, 0.5625, 0.59375, 0.625].map(y => render(y))
    expect(Math.min(...values)).toBeGreaterThan(251)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
  })

  it('clips the emitting polygon at the receiving surface horizon', () => {
    expect(render(0.5, [1, 0, 0])).toBeGreaterThan(110)
    expect(render(0.5, [1, 0, 0])).toBeLessThan(128)
    expect(render(0.5, [0, 0, 1])).toBe(0)
  })
  it('matches dense integration for a small tile across the receiving horizon', () => {
    const lights = filter.uniforms.u_airiLights as Float32Array
    lights.fill(0)
    lights.set([1, 1, 1], (4 * screenLightGridSize + 5) * 3)
    try {
      for (const normal of [[0, 0, -1], [1, 0, 0], [0, 1, 0], [-0.1, 0, -1]]) {
        let expected = 0
        const length = Math.hypot(...normal)
        const n = normal.map(v => v / length)
        // Independent midpoint integration of the flat 0.25 by 0.25 tile.
        // Unlike the shader's spherical edge integral, this samples its area.
        for (let y = 0; y < 128; y++) {
          for (let x = 0; x < 128; x++) {
            const delta = [0.25 + (x + 0.5) * 0.25 / 128, 0.6 - (0.5 + (y + 0.5) * 0.25 / 128), -0.04]
            const r2 = delta.reduce((sum, v) => sum + v * v, 0)
            const cosine = Math.max(0, delta.reduce((sum, v, i) => sum + v * n[i], 0))
            expected += cosine * 0.04 / (Math.PI * r2 * r2) * (0.25 / 128) ** 2
          }
        }
        expect(Math.abs(render(0.6, normal) / 255 - expected)).toBeLessThan(0.006)
      }
    }
    finally {
      lights.fill(1)
    }
  })
})
