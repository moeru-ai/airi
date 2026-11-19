import type { PresenceBubbleAdvanceInput } from './advance'
import type { PresenceBubblePalette } from './painter'

import { describe, expect, it, vi } from 'vitest'

import { PresenceBubbleAdvancer } from './advance'
import { PresenceBubblePainter } from './painter'
import { choosePresenceBubbleMode, resolvePresenceBubblePlacement } from './placement'

const palette: PresenceBubblePalette = {
  panel: '#fafafa',
  shadow: '#171717',
  ink: '#404040',
  badge: '#e5484d',
  badgeInk: '#ffffff',
}

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

function createAdvancer() {
  return new PresenceBubbleAdvancer(new PresenceBubblePainter(() => stubCanvas()))
}

function advance(subject: PresenceBubbleAdvancer, head: { x: number, y: number, width: number, height: number } | undefined, deltaMs = 16) {
  return subject.advance({
    state: { thinking: true, unreadCount: 0 },
    deltaMs,
    animated: true,
    resolution: 2,
    stageWidth: 260,
    stageHeight: 100,
    head: () => head,
    readPalette: () => palette,
  })
}

/** A thinking frame on a 260 by 100 stage, with the head left of centre. */
function input(overrides: Partial<PresenceBubbleAdvanceInput> = {}): PresenceBubbleAdvanceInput {
  return {
    state: { thinking: true, unreadCount: 0 },
    deltaMs: 16,
    animated: true,
    resolution: 2,
    stageWidth: 260,
    stageHeight: 100,
    head: () => ({ x: 60, y: 20, width: 80, height: 80 }),
    readPalette: () => palette,
    ...overrides,
  }
}

describe('presence bubble advancer', () => {
  it('does not measure the head while there is nothing to show', () => {
    // ROOT CAUSE:
    //
    // Sharing the frame loop moved the head measurement ahead of the content
    // check, so every idle frame walked the tracked drawables:
    //
    //   const head = props.headAnchor()
    //   advancer.advance({ ..., head })
    //
    // The head is now a getter the advancer calls after it has content.
    const subject = createAdvancer()
    let measured = 0

    subject.advance({
      state: { thinking: false, unreadCount: 0 },
      deltaMs: 16,
      animated: true,
      resolution: 2,
      stageWidth: 260,
      stageHeight: 100,
      head: () => {
        measured++
        return { x: 150, y: 20, width: 80, height: 80 }
      },
      readPalette: () => palette,
    })

    expect(measured).toBe(0)
  })

  it('releases the follower while hidden', () => {
    const subject = createAdvancer()
    advance(subject, { x: 150, y: 20, width: 80, height: 80 })

    expect(subject.advance({
      state: { thinking: false, unreadCount: 0 },
      deltaMs: 16,
      animated: true,
      resolution: 2,
      stageWidth: 260,
      stageHeight: 100,
      head: () => undefined,
      readPalette: () => palette,
    })).toBeUndefined()

    const shown = advance(subject, { x: 30, y: 20, width: 80, height: 80 })!
    const placement = resolvePresenceBubblePlacement({
      stageWidth: 260,
      stageHeight: 100,
      headX: 30,
      headY: 20,
      headWidth: 80,
      headHeight: 80,
      bubbleWidth: shown.frame.panelWidth,
      bubbleHeight: shown.frame.panelHeight,
      gap: shown.frame.tailReach + 4,
    }, shown.mode)

    expect(shown.x).toBe(placement.x)
    expect(shown.y).toBe(placement.y)
  })

  it('keeps the prior decision through one head-box jump', () => {
    const subject = createAdvancer()
    const initial = advance(subject, { x: 150, y: 20, width: 80, height: 80 })!
    const jumped = advance(subject, { x: 30, y: 20, width: 80, height: 80 })!
    const rawMode = choosePresenceBubbleMode({
      stageWidth: 260,
      stageHeight: 100,
      headX: 30,
      headY: 20,
      headWidth: 80,
      headHeight: 80,
      bubbleWidth: jumped.frame.panelWidth,
      bubbleHeight: jumped.frame.panelHeight,
      gap: jumped.frame.tailReach + 4,
    }, initial.mode)

    expect(initial.mode).toBe('left')
    expect(rawMode).toBe('right')
    expect(jumped.mode).toBe('left')
  })

  it('hands the chosen side back to the next decision', () => {
    // The band in `choosePresenceBubbleMode` only holds a side it is told about.
    // The right keeps enough room to stay but not to be taken, and the left is
    // roomier, so a decision made fresh each frame would move left.
    const subject = createAdvancer()
    const first = subject.advance(input())!

    let last = first
    for (let frame = 0; frame < 60; frame++)
      last = subject.advance(input({ head: () => ({ x: 110, y: 20, width: 80, height: 80 }) }))!

    expect(first.mode).toBe('right')
    expect(last.mode).toBe('right')
  })

  it('asks for an upload only when the pixels changed', () => {
    const subject = createAdvancer()

    expect(subject.advance(input())!.repainted).toBe(true)
    expect(subject.advance(input({ deltaMs: 1 }))!.repainted).toBe(false)
  })

  it('reads the palette a few times a second rather than every frame', () => {
    // Each read forces a style recalculation.
    const subject = createAdvancer()
    let reads = 0
    const readPalette = () => {
      reads++
      return palette
    }

    for (let frame = 0; frame < 10; frame++)
      subject.advance(input({ readPalette }))

    expect(reads).toBe(1)
  })

  it('repaints in a theme that changed while the bubble was hidden', () => {
    const subject = createAdvancer()
    let theme = palette
    const readPalette = () => theme

    subject.advance(input({ readPalette }))
    subject.advance(input({ state: { thinking: false, unreadCount: 0 }, readPalette }))
    theme = { ...palette, panel: '#262626' }

    expect(subject.advance(input({ readPalette }))!.repainted).toBe(true)
  })

  it('aims the tail at the head from where the panel sits', () => {
    // The painter takes the head in the panel's own coordinates.
    const painter = new PresenceBubblePainter(() => stubCanvas())
    const paint = vi.spyOn(painter, 'paint')
    const subject = new PresenceBubbleAdvancer(painter)
    const head = { x: 60, y: 20, width: 80, height: 80 }

    const result = subject.advance(input({ head: () => head }))!

    expect(paint.mock.lastCall?.[1].tailTarget).toEqual({
      x: head.x + head.width / 2 - result.x,
      y: head.y + head.height / 2 - result.y,
    })
  })

  it('decides from the new stage after a release', () => {
    // A release follows a change of render scale, so a box settled in the old
    // units says nothing about where the head is now.
    const subject = createAdvancer()
    const before = subject.advance(input())!

    subject.release()
    const after = subject.advance(input({ head: () => ({ x: 130, y: 20, width: 80, height: 80 }) }))!

    expect(before.mode).toBe('right')
    expect(after.mode).toBe('left')
  })
})
