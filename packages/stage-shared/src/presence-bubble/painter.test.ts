import type { PresenceBubblePalette } from './painter'

import { describe, expect, it } from 'vitest'

import { PresenceBubblePainter } from './painter'

/**
 * A canvas that records nothing and measures every string the same.
 *
 * The painter is asked here about when it redraws, not about what it draws, and
 * a real 2D context needs a browser.
 */
function stubCanvas() {
  const context = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    measureText: (text: string) => ({ width: text.length * 7 }),
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arcTo: () => {},
    arc: () => {},
    fill: () => {},
    fillText: () => {},
  }

  return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement
}

const palette: PresenceBubblePalette = {
  panel: '#fafafa',
  shadow: '#171717',
  ink: '#404040',
  badge: '#e5484d',
  badgeInk: '#ffffff',
}

function painter() {
  return new PresenceBubblePainter(() => stubCanvas())
}

const thinking = { kind: 'thinking', phase: 2, animated: true } as const
const options = { resolution: 2, palette }

describe('presence bubble painter', () => {
  it('does not redraw for a repeat of the same frame', () => {
    const subject = painter()

    const first = subject.paint(thinking, options)
    const second = subject.paint(thinking, options)

    expect(second?.revision).toBe(first?.revision)
  })

  it('redraws when the dots move on', () => {
    const subject = painter()
    const first = subject.paint(thinking, options)

    const next = subject.paint({ ...thinking, phase: 3 }, options)

    expect(next?.revision).not.toBe(first?.revision)
  })

  it('redraws when the theme changes', () => {
    const subject = painter()
    const first = subject.paint(thinking, options)

    const dark = subject.paint(thinking, { ...options, palette: { ...palette, panel: '#26262b' } })

    expect(dark?.revision).not.toBe(first?.revision)
  })

  it('redraws when the display density changes', () => {
    const subject = painter()
    const first = subject.paint(thinking, options)

    const dense = subject.paint(thinking, { ...options, resolution: 3 })

    expect(dense?.revision).not.toBe(first?.revision)
  })

  it('redraws when the tail swings to a visibly different angle', () => {
    const subject = painter()
    const first = subject.paint(thinking, { ...options, tailTarget: { x: 20, y: 90 } })

    const swung = subject.paint(thinking, { ...options, tailTarget: { x: -60, y: 90 } })

    expect(swung?.revision).not.toBe(first?.revision)
  })

  it('holds the drawing through motion the spring smooths away', () => {
    const subject = painter()
    const first = subject.paint(thinking, { ...options, tailTarget: { x: 20, y: 90 } })

    const nudged = subject.paint(thinking, { ...options, tailTarget: { x: 20.4, y: 90.4 } })

    expect(nudged?.revision).toBe(first?.revision)
  })

  it('redraws when the count changes and holds when it does not', () => {
    const subject = painter()
    const fourteen = subject.paint({ kind: 'unread', count: 14 }, options)

    const fifteen = subject.paint({ kind: 'unread', count: 15 }, options)
    const again = subject.paint({ kind: 'unread', count: 15 }, options)

    expect(fifteen?.revision).not.toBe(fourteen?.revision)
    expect(again?.revision).toBe(fifteen?.revision)
  })

  it('reports the panel apart from the surface it is drawn on', () => {
    const frame = painter().paint(thinking, options)

    expect(frame?.panelWidth).toBeLessThan(frame!.width)
    expect(frame?.anchorX).toBe((frame!.width - frame!.panelWidth) / 2)
  })
})
