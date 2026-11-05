import type { AmbientLightEnvironment, NormalizedRectangle } from '@proj-airi/stage-shared/screen-ambient-light'

import { Application } from '@pixi/app'
import { BatchRenderer, Filter, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { ambientLightDefaults, ambientLightNeutralEnvironment } from '@proj-airi/stage-shared/screen-ambient-light'
import { afterAll, expect, it } from 'vitest'

import { screenLightCount, screenLightGridSize, surfaceIrradianceShader, surfaceLightFrame, writeScreenEdges, writeScreenGeometry } from './surface-irradiance'
import { SurfaceLightField } from './surface-light-field'

extensions.add(BatchRenderer, TickerPlugin)
const app = new Application({ width: 1, height: 1, autoStart: false, backgroundAlpha: 0, preserveDrawingBuffer: true })
const sprite = app.stage.addChild(new Sprite(Texture.WHITE))
const field = new SurfaceLightField()
const geometry = { gap: 0.08, bend: 5, flatRadius: 0.22, areaLights: true }
const material = { ...ambientLightDefaults.material, illustrated: false, sheen: 0 }
const lights = new Float32Array(screenLightCount * 3)
// A distant red source occupies the left half of a 1536 x 960 display.
for (let row = 0; row < screenLightGridSize; row++) {
  for (let column = 0; column < screenLightGridSize / 2; column++) lights[(row * screenLightGridSize + column) * 3] = 1
}
const emitters = new Float32Array(screenLightGridSize * 4)
const edges = new Float32Array((screenLightGridSize + 1) * 4)
const filter = new Filter(undefined, `
precision highp float;
uniform vec3 normal;
uniform vec2 position;
uniform float cached;
uniform float u_airiStrength;
uniform float u_airiChroma;
uniform float u_airiDirectional;
${surfaceIrradianceShader}
void main() {
  vec3 n=normalize(normal);
  vec3 light=vec3(0.);
  if (cached > .5) light=airiReadField(n,position,0.);
  else {
    for (int row=0;row<8;row++) for (int col=0;col<8;col++)
      light+=u_airiLights[row*8+col]*airiScreenWeight(n,position,airiEmitterY(float(row)),u_airiEmitters[col],u_airiEdges[col].xy,u_airiEdges[col+1].xy).x;
  }
  gl_FragColor=vec4(light,1.);
}`, {
  normal: [-0.8, 0, 0.6],
  position: [0.5, 0.5],
  cached: 0,
  u_airiLights: lights,
  u_airiEmitters: emitters,
  u_airiEdges: edges,
  u_airiBounds: [0, 0, 1, 1],
  u_airiScreen: [-0.5, -0.5, 2, 2],
  u_airiStageAspect: 1,
  u_airiField: field.texture,
  u_airiFieldBounds: field.bounds,
  u_airiArea: 1,
  u_airiIllustrated: 0,
  u_airiSheen: 0,
  u_airiFaceShadowStrength: 0,
})
sprite.filters = [filter]
let time = 0

function configure(window: NormalizedRectangle, character: NormalizedRectangle) {
  const environment: AmbientLightEnvironment = {
    ...ambientLightNeutralEnvironment,
    screen: { aspect: window.width / window.height, radiance: ambientLightNeutralEnvironment.contact, stage: { x: window.x / 1536, y: window.y / 960, width: window.width / 1536, height: window.height / 960 } },
  }
  const bounds = { x: (character.x - window.x) / window.width, y: (character.y - window.y) / window.height, width: character.width / window.width, height: character.height / window.height }
  const frame = surfaceLightFrame(environment, bounds)
  const screen = frame.screen
  filter.uniforms.u_airiBounds = [bounds.x, bounds.y, bounds.width, bounds.height]
  filter.uniforms.u_airiScreen = [screen.x, screen.y, screen.width, screen.height]
  filter.uniforms.u_airiStageAspect = window.width / window.height
  filter.uniforms.position = [bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.3]
  writeScreenGeometry(geometry, window.width / window.height, emitters, frame)
  writeScreenEdges(geometry, window.width / window.height, edges, frame)
  field.update(app.renderer, lights, geometry, window.width / window.height, material, time += 100, frame)
  return frame
}
function render(cached: boolean) {
  filter.uniforms.cached = cached ? 1 : 0
  app.render()
  const gl = app.renderer.gl
  const pixel = new Uint8Array(4)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  expect(gl.getError()).toBe(gl.NO_ERROR)
  return pixel[0] / 255
}

afterAll(() => {
  field.dispose()
  app.destroy(true, { children: true })
  filter.destroy()
})

it('keeps emission and received light fixed when only empty window space changes', () => {
  // ROOT CAUSE:
  // Window-centered emitters changed direction when transparent margins changed.
  // Both windows below contain the same character at the same display position.
  const character = { x: 1100, y: 450, width: 350, height: 480 }
  configure({ x: 1036, y: 374, width: 496, height: 589 }, character)
  const originalEmitters = emitters.slice()
  const originalEdges = edges.slice()
  const direct = render(false)
  const cached = render(true)
  expect(direct).toBeGreaterThan(0.05)
  expect(Math.abs(cached - direct)).toBeLessThan(0.025)
  configure({ x: 800, y: 200, width: 736, height: 760 }, character)
  expect(emitters).toEqual(originalEmitters)
  expect(edges).toEqual(originalEdges)
  expect(render(false)).toBeCloseTo(direct, 2)
  expect(render(true)).toBeCloseTo(cached, 2)
})

it('moves real emitters relative to the character and stops at the display edge', () => {
  const window = { x: 800, y: 200, width: 900, height: 800 }
  const character = { x: 1100, y: 450, width: 350, height: 480 }
  const frame = configure(window, character)
  expect(window.x + (frame.screen.x + frame.screen.width) * window.width).toBeCloseTo(1536)
  const before = emitters.slice()
  const received = render(false)
  configure(window, { ...character, x: 900 })
  expect(emitters).not.toEqual(before)
  expect(Math.abs(render(false) - received)).toBeGreaterThan(0.01)
  const moved = emitters.slice()
  configure(window, { ...character, height: 300 })
  expect(emitters).not.toEqual(moved)
  expect(Math.abs(render(true) - render(false))).toBeLessThan(0.025)
})
