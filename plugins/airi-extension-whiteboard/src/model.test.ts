import { describe, expect, it } from 'vitest'

import { WhiteboardStore } from './model'
import { createCanvasSvg } from './svg'

describe('whiteboardStore', () => {
  it('keeps path and text changes in one undoable document history', () => {
    const store = new WhiteboardStore()
    const canvas = store.createCanvas({ name: 'Sketch', now: 1 })
    const path = store.addPath({
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      color: '#ef4444',
      width: 6,
    })
    const text = store.addText({ value: 'Hello <AIRI>', x: 20, y: 30 })

    expect(store.document.canvases).toHaveLength(1)
    expect(store.activeCanvas?.id).toBe(canvas.id)
    expect(store.activeCanvas?.paths).toEqual([path])
    expect(store.activeCanvas?.texts).toEqual([text])

    expect(store.undo()).toBe(true)
    expect(store.activeCanvas?.texts).toEqual([])
    expect(store.undo()).toBe(true)
    expect(store.activeCanvas?.paths).toEqual([])
    expect(store.redo()).toBe(true)
    expect(store.activeCanvas?.paths).toEqual([path])
  })

  it('exports SVG paths and safely escaped text from the selected canvas', () => {
    const store = new WhiteboardStore()
    store.createCanvas({ background: '#fff' })
    store.addPath({ points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] })
    store.addText({ value: 'A & <B>', x: 30, y: 40 })

    const svg = createCanvasSvg(store.activeCanvas!)

    expect(svg).toContain('points="10,20 30,40"')
    expect(svg).toContain('A &amp; &lt;B&gt;')
  })
})
