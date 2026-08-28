import { Application } from '@pixi/app'
import { BatchRenderer, Renderer, Texture } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Sprite } from '@pixi/sprite'
import { TickerPlugin } from '@pixi/ticker'
import { afterAll, describe, expect, it } from 'vitest'

import { live2dAmbientLightDefaults } from '../stores/ambient-light'
import { ScreenAmbientLightFilter } from './screen-ambient-light'

extensions.add(BatchRenderer, TickerPlugin)

describe('screen ambient light filter', () => {
  it('does not treat black as light', () => {
    // ROOT CAUSE:
    //
    // The old shader multiplied the model by a brightness value below one when
    // the sampled color was black. We fixed this by adding emitted light energy,
    // which makes a black sample contribute zero instead of darkening the model.
    const pixels = renderLight({
      ambient: { red: 0, green: 0, blue: 0, luminance: 0 },
      direction: { x: 1, y: 0 },
      mode: 'window-gradient',
    })

    expect(redAt(pixels, 50)).toBeCloseTo(64, 0)
  })

  it('limits prominent light to the display-facing side', () => {
    // ROOT CAUSE:
    //
    // Blending corner samples spread the tint across the model and did not use
    // the window's actual angle to the display center. We fixed this with a
    // projected direction and separate broad-tint and narrow-highlight bands.
    const pixels = renderLight({
      ambient: { red: 1, green: 0, blue: 0, luminance: 0.2126 },
      direction: { x: 1, y: 0 },
      mode: 'window-gradient',
    })

    const oppositeSide = redAt(pixels, 5)
    const middle = redAt(pixels, 50)
    const facingSide = redAt(pixels, 95)

    expect(middle).toBeGreaterThan(oppositeSide)
    expect(facingSide).toBeGreaterThan(middle + 20)
  })

  it('keeps global ambient light spatially uniform', () => {
    const pixels = renderLight({
      ambient: { red: 1, green: 0, blue: 0, luminance: 0.2126 },
      direction: { x: 1, y: 0 },
      mode: 'global',
    })

    expect(redAt(pixels, 5)).toBeCloseTo(redAt(pixels, 95), 0)
  })
})

afterAll(() => document.querySelectorAll('canvas[data-ambient-light-test]').forEach(canvas => canvas.remove()))

function renderLight({
  ambient,
  direction,
  mode,
}: {
  ambient: { red: number, green: number, blue: number, luminance: number }
  direction: { x: number, y: number }
  mode: 'window-gradient' | 'global'
}) {
  const source = document.createElement('canvas')
  source.width = 100
  source.height = 1
  const sourceContext = source.getContext('2d')!
  sourceContext.fillStyle = 'rgb(64, 64, 64)'
  sourceContext.fillRect(0, 0, source.width, source.height)

  const app = new Application({
    width: source.width,
    height: source.height,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
  })
  app.view.dataset.ambientLightTest = ''
  document.body.appendChild(app.view)

  const texture = Texture.from(source)
  const sprite = new Sprite(texture)
  const filter = new ScreenAmbientLightFilter()
  filter.update(ambient, direction, mode, 1, live2dAmbientLightDefaults.filter, source.width / source.height)
  sprite.filters = [filter]
  app.stage.addChild(sprite)
  app.render()

  const pixels = new Uint8Array(source.width * source.height * 4)
  if (!(app.renderer instanceof Renderer))
    throw new TypeError('The ambient-light shader test requires a WebGL renderer')

  const gl = app.renderer.gl
  gl.readPixels(0, 0, source.width, source.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

  app.destroy(true, { children: true, texture: true, baseTexture: true })
  return pixels
}

function redAt(pixels: Uint8Array, x: number) {
  return pixels[x * 4]
}
