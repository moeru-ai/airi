import type { PresenceBubblePalette } from './painter'

import { describe, expect, it } from 'vitest'

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
})
