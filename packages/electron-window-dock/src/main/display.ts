import type { Rectangle } from 'electron'

import { screen } from 'electron'

/**
 * Returns the bounds of the display that fully contains `bounds`.
 * Returns `undefined` when the window spans displays or is off screen. Then the controller uses the display that matches the window best.
 */
export function getDisplayBounds(bounds: Rectangle): Rectangle | undefined {
  const display = screen.getAllDisplays().find((display) => {
    const d = display.bounds
    return (
      bounds.x >= d.x
      && bounds.y >= d.y
      && bounds.x + bounds.width <= d.x + d.width
      && bounds.y + bounds.height <= d.y + d.height
    )
  })
  return display?.bounds
}

/** Returns `true` when the two rects share an area. Rects that only touch at an edge do not intersect. */
export function rectsIntersect(a: Rectangle, b: Rectangle): boolean {
  const dx = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const dy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return dx > 0 && dy > 0
}
