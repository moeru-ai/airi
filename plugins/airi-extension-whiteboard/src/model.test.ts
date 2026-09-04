import { describe, expect, it } from 'vitest'

import { executeWhiteboardCommand } from './commands'
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

  // https://github.com/moeru-ai/airi/pull/2441#discussion_r3922208885
  it('restores the document and undo history when persistence fails', () => {
    // ROOT CAUSE:
    //
    // A command changed the store before localStorage saved the document.
    // A storage error reported failure but retained the changed state.
    //
    // We fixed this by restoring the document history when the storage operation throws.
    const store = new WhiteboardStore()
    const canvas = store.createCanvas({ name: 'Plan' })

    expect(() => store.transact(() => {
      executeWhiteboardCommand(store, {
        type: 'add_path',
        canvasId: canvas.id,
        points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      })
      throw new Error('Storage quota exceeded.')
    })).toThrow('Storage quota exceeded.')

    expect(store.document.canvases[0]?.paths).toEqual([])
    expect(store.undo()).toBe(true)
    expect(store.document.canvases).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2441#discussion_r3922208889
  it('keeps a bounded number of undo snapshots', () => {
    // ROOT CAUSE:
    //
    // Each edit kept a complete document snapshot without a size limit.
    // Long drawing sessions retained all previous canvas content in memory.
    //
    // We fixed this by retaining the most recent 100 snapshots.
    const store = new WhiteboardStore()
    for (let index = 0; index <= 100; index += 1) {
      store.createCanvas({ name: `Canvas ${index}` })
    }

    let undoCount = 0
    while (store.undo()) {
      undoCount += 1
    }

    expect(undoCount).toBe(99)
    expect(store.document.canvases).toHaveLength(2)
  })
})
