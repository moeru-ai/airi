import { Application } from '@pixi/app'
import { BatchRenderer, Filter, Renderer, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { afterAll, describe, expect, it } from 'vitest'

import { screenAreaLightShader } from './screen-area-light'

extensions.add(BatchRenderer, TickerPlugin)
const app = new Application({ width: 1, height: 1, autoStart: false, backgroundAlpha: 0, preserveDrawingBuffer: true })
const sprite = app.stage.addChild(new Sprite(Texture.WHITE))
const filter = new Filter(undefined, `
precision highp float;
uniform vec3 uNormal;
uniform vec4 uBounds;
uniform float uGap;
uniform float uRotation;
${screenAreaLightShader}
void main() {
  vec3 a=vec3(uBounds.x,uBounds.w,-uGap),b=vec3(uBounds.x,uBounds.z,-uGap);
  vec3 c=vec3(uBounds.y,uBounds.z,-uGap),d=vec3(uBounds.y,uBounds.w,-uGap);
  vec3 n=normalize(uNormal);
  float co=cos(uRotation),si=sin(uRotation);
  mat3 rotation=mat3(co,0.,si,0.,1.,0.,-si,0.,co);
  a=rotation*a;b=rotation*b;c=rotation*c;d=rotation*d;n=rotation*n;
  gl_FragColor=vec4(airiAreaDiffuse(n,a,b,c,d),0.,0.,1.);
}`, { uNormal: [0, 0, -1], uBounds: [-0.5, 0.5, -0.5, 0.5], uGap: 1, uRotation: 0 })
sprite.filters = [filter]
afterAll(() => {
  app.destroy(true, { children: true })
  filter.destroy()
})
function render(bounds: number[], gap: number, normal = [0, 0, -1], rotation = 0) {
  filter.uniforms.uRotation = rotation
  filter.uniforms.uBounds = bounds
  filter.uniforms.uGap = gap
  filter.uniforms.uNormal = normal
  app.render()
  if (!(app.renderer instanceof Renderer))
    throw new TypeError('Area lighting requires WebGL')
  const gl = app.renderer.gl
  const pixel = new Uint8Array(4)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  expect(gl.getError()).toBe(gl.NO_ERROR)
  return pixel[0] / 255
}

describe('distance-driven screen transport', () => {
  it('preserves transport when the emitter and receiver rotate together', () => {
    const reference = render([-0.1, 0.4, -0.2, 0.3], 0.2, [0.3, 0.2, -1])
    for (const angle of [-1.2, -0.4, 0.7, 1.4]) {
      const rotated = render([-0.1, 0.4, -0.2, 0.3], 0.2, [0.3, 0.2, -1], angle)
      expect(Math.abs(rotated - reference)).toBeLessThanOrEqual(1 / 255)
    }
  })

  it('preserves uniform-screen energy and loses energy at the physical screen edge', () => {
    expect(render([-100, 100, -100, 100], 1)).toBe(1)
    expect(render([0, 100, -100, 100], 1)).toBeCloseTo(0.5, 2)
    expect(render([-0.1, 0.1, -0.1, 0.1], 4)).toBeLessThan(0.01)
    expect(render([-1, 1, -1, 1], 1, [0, 0, 1])).toBe(0)
  })

  it('spreads a local source with gap without adding light or a second blur', () => {
    const nearCenter = render([-0.1, 0.1, -0.1, 0.1], 0.04)
    const nearNeighbor = render([0.2, 0.4, -0.1, 0.1], 0.04)
    const farCenter = render([-0.1, 0.1, -0.1, 0.1], 0.3)
    const farNeighbor = render([0.2, 0.4, -0.1, 0.1], 0.3)
    expect(nearCenter).toBeGreaterThan(farCenter)
    expect(farNeighbor / farCenter).toBeGreaterThan(nearNeighbor / nearCenter)
  })
})
