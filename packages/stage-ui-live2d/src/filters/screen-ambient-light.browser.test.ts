import type { Live2DAmbientLightFilterOptions } from '../stores/ambient-light'

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
      filterOptions: { baseBrightness: 1, baseContrast: 1 },
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

  it('keeps diagonal highlight coverage consistent with its configured area', () => {
    const pixels = renderLight({
      ambient: { red: 1, green: 0, blue: 0, luminance: 0.2126 },
      direction: { x: 1, y: 1 },
      filterOptions: {
        baseBrightness: 1,
        baseContrast: 1,
        highlightCoverage: 0.3,
        highlightStrength: 1,
        tintStrength: 0,
      },
      height: 100,
      mode: 'window-gradient',
    })

    const highlightedPixels = Array.from({ length: 100 * 100 }, (_, index) => pixels[index * 4])
      .filter(red => red > 64)

    expect(highlightedPixels.length / (100 * 100)).toBeGreaterThan(0.25)
    expect(highlightedPixels.length / (100 * 100)).toBeLessThan(0.35)
  })

  it('keeps the shadow side below the unlit exposure', () => {
    // ROOT CAUSE:
    //
    // Pure additive light leaves the shadow side at the source exposure. Strong
    // light then raises the facing side and compresses the visible contrast.
    const pixels = renderLight({
      ambient: { red: 0.62, green: 0.17, blue: 0.99, luminance: 0.325 },
      direction: { x: 1, y: 0 },
      mode: 'window-gradient',
    })

    expect(redAt(pixels, 5)).toBeLessThan(64)
  })

  it('does not replace dark details with the light color', () => {
    // ROOT CAUSE:
    //
    // The highlight fill was strongest where the model texture approached
    // black. Colored light then replaced eyelashes, line art, and deep hair
    // shadows instead of preserving their local contrast.
    const pixels = renderLight({
      ambient: { red: 1, green: 0, blue: 0, luminance: 0.2126 },
      direction: { x: 1, y: 0 },
      filterOptions: {
        baseBrightness: 1,
        highlightCoverage: 1,
        highlightStrength: 1,
        tintStrength: 0,
      },
      mode: 'window-gradient',
      sourceValue: 8,
    })

    expect(redAt(pixels, 95)).toBeLessThan(32)
  })

  it('deepens midtones with base contrast before adding light', () => {
    const pixels = renderLight({
      ambient: { red: 0, green: 0, blue: 0, luminance: 0 },
      direction: { x: 1, y: 0 },
      filterOptions: { baseBrightness: 1, baseContrast: 1.2 },
      mode: 'window-gradient',
      sourceValue: 128,
    })

    expect(redAt(pixels, 50)).toBeLessThan(128)
  })

  it('preserves highlight headroom under strong light', () => {
    // ROOT CAUSE:
    //
    // The hard clamp flattened bright source pixels after additive light pushed
    // them above one. A soft headroom curve keeps those differences visible.
    const pixels = renderLight({
      ambient: { red: 1, green: 0.17, blue: 0.99, luminance: 0.407 },
      direction: { x: 1, y: 0 },
      filterOptions: {
        tintCoverage: 0.62,
        highlightCoverage: 0.8,
        tintStrength: 0.37,
        highlightStrength: 0.72,
      },
      mode: 'window-gradient',
      sourceValue: 220,
      strength: 0.74,
    })

    expect(redAt(pixels, 95)).toBeLessThan(255)
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
  filterOptions,
  height = 1,
  mode,
  sourceValue = 64,
  strength = 1,
}: {
  ambient: { red: number, green: number, blue: number, luminance: number }
  direction: { x: number, y: number }
  filterOptions?: Partial<Live2DAmbientLightFilterOptions>
  height?: number
  mode: 'window-gradient' | 'global'
  sourceValue?: number
  strength?: number
}) {
  const source = document.createElement('canvas')
  source.width = 100
  source.height = height
  const sourceContext = source.getContext('2d')!
  sourceContext.fillStyle = `rgb(${sourceValue}, ${sourceValue}, ${sourceValue})`
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
  filter.update(
    ambient,
    direction,
    mode,
    strength,
    { ...live2dAmbientLightDefaults.filter, ...filterOptions },
    source.width / source.height,
  )
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
