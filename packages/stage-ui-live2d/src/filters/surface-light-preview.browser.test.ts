import type { SurfaceLightPreviewShape } from './surface-light-preview'

import { Application } from '@pixi/app'
import { BatchRenderer, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { createAmbientLightMap } from '@proj-airi/stage-shared/screen-ambient-light'
import { afterAll, describe, expect, it } from 'vitest'

import { SurfaceLightPreviewFilter } from './surface-light-preview'

extensions.add(BatchRenderer, TickerPlugin)
const app = new Application({ width: 100, height: 100, autoStart: false, backgroundAlpha: 0, preserveDrawingBuffer: true })
const sprite = new Sprite(Texture.WHITE)
sprite.width = 100
sprite.height = 100
const filter = new SurfaceLightPreviewFilter()
sprite.filters = [filter]
app.stage.addChild(sprite)
afterAll(() => {
  app.destroy(true, { children: true })
  filter.destroy()
})

function render(column: number, bend = 0, shape: SurfaceLightPreviewShape = 'cylinder', normals = false) {
  const map = createAmbientLightMap()
  for (let y = 8; y < 16; y++) {
    for (let x = column; x < column + 4; x++) map.data[(y * 24 + x) * 3] = 1
  }
  filter.update({ environment: { exposure: 0, behindLuminance: 0, surround: map, contact: map }, geometry: { bend, gap: 0.04, flatRadius: 0.1 }, mode: 'window-gradient', strength: 3, chroma: 1, aspect: 1, shape, normals })
  app.render()
  const gl = app.renderer.gl
  const pixels = new Uint8Array(100 * 100 * 4)
  gl.readPixels(0, 0, 100, 100, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  expect(gl.getError()).toBe(0)
  return (x: number, y: number) => Array.from(pixels.slice(((99 - y) * 100 + x) * 4, ((99 - y) * 100 + x) * 4 + 4))
}

describe('surface lighting debug shapes', () => {
  it('lights the side facing the captured source', () => {
    const left = render(3)
    const right = render(17)
    expect(left(25, 50)[0]).toBeGreaterThan(right(25, 50)[0])
    expect(right(75, 50)[0]).toBeGreaterThan(left(75, 50)[0])
  })

  it('shows frontal light only when the emitter bends forward', () => {
    const flat = render(18)
    const curved = render(18, 3)
    expect(curved(50, 50)[0]).toBeGreaterThan(flat(50, 50)[0])
    expect(curved(50, 50)[3]).toBe(255)
    expect(curved(0, 0)[3]).toBe(0)
  })

  it('shows vertical normals on the sphere and constant vertical normals on the cylinder', () => {
    const sphere = render(3, 0, 'sphere', true)
    const cylinder = render(3, 0, 'cylinder', true)
    expect(sphere(50, 25)[1]).toBeGreaterThan(sphere(50, 75)[1])
    expect(sphere(75, 50)[0]).toBeGreaterThan(sphere(25, 50)[0])
    expect(cylinder(50, 25)[1]).toBe(cylinder(50, 75)[1])
    expect(sphere(25, 25)[3]).toBe(0)
    expect(cylinder(25, 25)[3]).toBe(255)
  })

  it('keeps the normals view independent of lighting and screen geometry', () => {
    const flat = render(3, 0, 'sphere', true)
    const curved = render(18, 3, 'sphere', true)
    expect(curved(50, 50)).toEqual(flat(50, 50))
    expect(curved(25, 50)).toEqual(flat(25, 50))
  })
})
