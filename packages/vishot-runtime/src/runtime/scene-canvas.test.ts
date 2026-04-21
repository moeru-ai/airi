// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import ScenarioCanvas from '../vue/components/scenario-canvas.vue'

import { computeScenarioCanvasScale } from './scene-canvas'

describe('computeScenarioCanvasScale', () => {
  it('fits the canvas to the smallest viewport ratio', () => {
    expect(computeScenarioCanvasScale({
      viewportWidth: 1440,
      viewportHeight: 900,
      canvasWidth: 1920,
      canvasHeight: 1080,
    })).toBe(0.75)
  })

  it('falls back to 1 when dimensions are missing', () => {
    expect(computeScenarioCanvasScale({
      viewportWidth: 0,
      viewportHeight: 900,
      canvasWidth: 1920,
      canvasHeight: 1080,
    })).toBe(1)
  })

  it('applies an additional multiplier to the fitted scale', () => {
    expect(computeScenarioCanvasScale({
      viewportWidth: 1440,
      viewportHeight: 900,
      canvasWidth: 1920,
      canvasHeight: 1080,
      scaleMultiplier: 0.75,
    })).toBe(0.5625)
  })

  it('renders a fixed logical surface for absolute-positioned scene content', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    createApp({
      render: () => h(
        ScenarioCanvas,
        {
          width: 1920,
          height: 1080,
        },
        {
          default: () => h('div', { id: 'scene-content' }),
        },
      ),
    }).mount(host)

    await nextTick()

    const surface = host.querySelector<HTMLElement>('[data-scenario-canvas-surface]')

    expect(surface).not.toBeNull()
    expect(surface?.style.width).toBe('1920px')
    expect(surface?.style.height).toBe('1080px')
  })

  it('applies scale multiplier to the rendered surface transform', async () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    const host = document.createElement('div')
    document.body.appendChild(host)

    createApp({
      render: () => h(
        ScenarioCanvas,
        {
          width: 1920,
          height: 1080,
          scaleMultiplier: 0.75,
        },
        {
          default: () => h('div', { id: 'scene-content' }),
        },
      ),
    }).mount(host)

    await nextTick()

    const surface = host.querySelector<HTMLElement>('[data-scenario-canvas-surface]')

    expect(surface).not.toBeNull()
    expect(surface?.style.transform).toBe('scale(0.75)')

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
  })
})
