import type { ViewportRectangle } from './adaptive-input-geometry'

import { describe, expect, it } from 'vitest'

import {
  calculateKeyboardShift,
  calculateVisualViewportLayout,
} from './adaptive-input-geometry'

function createRectangle(options: {
  bottom: number
  left?: number
  right?: number
  top: number
}): ViewportRectangle {
  const left = options.left ?? 0
  const right = options.right ?? 390

  return {
    bottom: options.bottom,
    height: options.bottom - options.top,
    left,
    right,
    top: options.top,
    width: right - left,
  }
}

describe('adaptive input geometry', () => {
  it('moves a bottom input area above a docked keyboard', () => {
    const target = createRectangle({ top: 780, bottom: 844 })
    const keyboard = createRectangle({ top: 544, bottom: 844 })

    expect(calculateKeyboardShift(target, keyboard)).toBe(300)
  })

  it('does not move the input area for a floating keyboard without horizontal overlap', () => {
    const target = createRectangle({ top: 780, bottom: 844, left: 0, right: 180 })
    const keyboard = createRectangle({ top: 500, bottom: 700, left: 210, right: 380 })

    expect(calculateKeyboardShift(target, keyboard)).toBe(0)
  })

  it('provides the offset needed to counter the iOS visual viewport pan', () => {
    const layout = calculateVisualViewportLayout({
      height: 404,
      offsetTop: 310,
      pageTop: 310,
    }, 714, 'focused')

    expect(layout.height).toBe(404)
    expect(layout.keyboardVisible).toBe(true)
    expect(layout.offsetTop).toBe(310)
    expect(layout.visibleBottom).toBe(714)
  })

  // https://bugs.webkit.org/show_bug.cgi?id=265578
  it('keeps the chat bottom at the visual viewport bottom for WebKit bug 265578', () => {
    // ROOT CAUSE:
    //
    // Safari can increase pageTop before it reports the final keyboard height.
    // A calculation that uses height alone places the chat layer above the visible bottom edge.
    //
    // Before the fix, the chat layer used visualViewport.height - keyboardShift as its bottom edge.
    //
    // We fixed this by using height + pageTop as the bottom edge in document coordinates.
    // Only the chat layer uses this value.
    const layout = calculateVisualViewportLayout({
      height: 404,
      offsetTop: 310,
      pageTop: 310,
    }, 714, 'focused')

    expect(layout.visibleBottom).toBe(714)
  })

  it('detects a keyboard when the browser resizes both viewports', () => {
    const layout = calculateVisualViewportLayout({
      height: 404,
      offsetTop: 0,
      pageTop: 0,
    }, 714, 'focused')

    expect(layout.keyboardVisible).toBe(true)
    expect(layout.offsetTop).toBe(0)
    expect(layout.visibleBottom).toBe(404)
  })

  it('does not treat browser controls as a keyboard', () => {
    const layout = calculateVisualViewportLayout({
      height: 654,
      offsetTop: 0,
      pageTop: 0,
    }, 714, 'focused')

    expect(layout.keyboardVisible).toBe(false)
    expect(layout.visibleBottom).toBe(654)
  })

  // https://bugs.webkit.org/show_bug.cgi?id=265578
  it('restores the input layout while Safari finishes closing the keyboard', () => {
    // ROOT CAUSE:
    //
    // Safari keeps reporting the keyboard-sized Visual Viewport for part of its close animation.
    // If AIRI uses that stale measurement after blur, the input region stays compressed and leaves
    // a visible gap above the keyboard.
    //
    // Before the fix, blur disabled keyboardVisible but kept height and visibleBottom at 404px.
    //
    // We fixed this by restoring the stable layout height as soon as the owned input loses focus.
    // Later Visual Viewport events cannot compress this input region again during keyboard close.
    const layout = calculateVisualViewportLayout({
      height: 404,
      offsetTop: 0,
      pageTop: 0,
    }, 714, 'closing')

    expect(layout.height).toBe(714)
    expect(layout.heightLossExceedsThreshold).toBe(true)
    expect(layout.keyboardVisible).toBe(false)
    expect(layout.offsetTop).toBe(0)
    expect(layout.visibleBottom).toBe(714)
  })

  it('keeps the Stage correction offset while Safari closes a panned viewport', () => {
    const layout = calculateVisualViewportLayout({
      height: 404,
      offsetTop: 310,
      pageTop: 310,
    }, 714, 'closing')

    expect(layout.offsetTop).toBe(310)
  })
})
