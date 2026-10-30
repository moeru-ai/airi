import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import TimelineCapsuleRow from './timeline-capsule-row.vue'

function paintedPixels(canvas: HTMLCanvasElement): number {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  let painted = 0
  for (let index = 3; index < pixels.length; index += 4)
    painted += pixels[index]! > 0 ? 1 : 0
  return painted
}

describe('timeline capsule row', () => {
  afterEach(cleanup)

  it('draws every activity, an open shimmer, an error, a lane, a waveform, and a chart', async () => {
    await page.viewport(900, 400)
    const level = { times: Array.from({ length: 40 }, (_, index) => index * 25), values: Array.from({ length: 40 }, (_, index) => 0.3 + 0.5 * Math.abs(Math.sin(index / 3))) }
    const rows = {
      activity: { items: [{ start: 20, end: 300, color: '#8b5cf6' }, { start: 320, end: 640, color: '#3b82f6', activity: 'waiting' as const }, { start: 660, end: 980, color: '#3b82f6', activity: 'thinking' as const, failed: true }] },
      open: { now: 1000, items: [{ start: 100, color: '#8b5cf6', activity: 'thinking' as const }] },
      lane: { kind: 'lane' as const, items: [{ start: 0, end: 900, color: '#8b5cf6', activity: 'waiting' as const }, { start: 300, end: 600, color: '#8b5cf6' }] },
      waveform: { items: [{ start: 0, end: 1000, color: '#f87171' }], content: { kind: 'waveform' as const, level } },
      chart: { content: { kind: 'chart' as const, series: level, threshold: 0.5 } },
    }
    const screen = render(defineComponent(() => () => h('div', { style: 'display: flex; flex-direction: column; gap: 6px; padding: 8px; width: 860px' }, Object.values(rows).map(row => h(TimelineCapsuleRow, row)))))

    // Each row is one canvas, in the order of `rows`.
    const canvases = screen.container.querySelectorAll('canvas')
    expect(canvases).toHaveLength(Object.keys(rows).length)
    for (const [index, name] of Object.keys(rows).entries()) {
      const canvas = canvases[index]!
      await expect.poll(() => paintedPixels(canvas), { message: name }).toBeGreaterThan(200)
    }
  })
})
