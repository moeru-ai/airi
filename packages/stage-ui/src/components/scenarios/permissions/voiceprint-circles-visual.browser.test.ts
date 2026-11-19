import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'

import VoiceprintCirclesVisual from './voiceprint-circles-visual.vue'

import 'virtual:uno.css'

afterEach(() => {
  cleanup()
})

const SILENCE = [0, 0, 0, 0]
const particles = (container: HTMLElement) => container.querySelectorAll('[data-testid="voiceprint-particle"]').length
const nextFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

describe('voiceprint circles visual', () => {
  it('releases particles when a recording becomes full, and they disappear after their life', async () => {
    const screen = render(VoiceprintCirclesVisual, { props: { label: 'Voiceprint', bands: SILENCE, stage: 'recording', progress: 1 } })
    expect(particles(screen.container)).toBe(0)

    await screen.rerender({ stage: 'full' })

    await expect.poll(() => particles(screen.container)).toBeGreaterThan(0)
    await expect.poll(() => particles(screen.container), { timeout: 3_000 }).toBe(0)
  })

  it('releases nothing when a full stage comes from somewhere other than a recording', async () => {
    const screen = render(VoiceprintCirclesVisual, { props: { label: 'Voiceprint', bands: SILENCE, stage: 'idle', progress: 0 } })

    await screen.rerender({ stage: 'full' })
    await nextFrames()

    expect(particles(screen.container)).toBe(0)
  })
})
