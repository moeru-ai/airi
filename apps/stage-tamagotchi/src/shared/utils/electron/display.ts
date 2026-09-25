import type { Rectangle } from 'electron'

/** Display geometry that is safe to use in main and renderer processes. */
export interface DisplayArea {
  /** Full bounds used to decide which display owns a cross-screen window. */
  bounds: Rectangle
  /** Usable bounds that exclude the system menu bar, dock, or taskbar. */
  workArea: Rectangle
}

/**
 * Finds the display that owns the largest visible share of a window.
 */
export function findDominantDisplayArea<T extends DisplayArea>(bounds: Rectangle, displays: readonly T[]): T | undefined {
  let dominantDisplay: T | undefined
  let dominantArea = -1

  for (const display of displays) {
    // Full display bounds identify the physical display. System UI must not
    // change display ownership for a window that crosses the work-area edge.
    const area = intersectionArea(bounds, display.bounds)
    if (area > dominantArea) {
      dominantDisplay = display
      dominantArea = area
    }
  }

  return dominantDisplay
}

/**
 * Moves `bounds` into `rect`. Bounds larger than `rect` shrink to it first,
 * so the top-left corner never lands above or left of `rect`.
 *
 * @example
 * clampBoundsWithinRect({ x: 900, y: -40, width: 1200, height: 300 }, { x: 0, y: 25, width: 1000, height: 700 })
 * // => { x: 0, y: 25, width: 1000, height: 300 }
 */
export function clampBoundsWithinRect(bounds: Rectangle, rect: Rectangle): Rectangle {
  const width = Math.min(bounds.width, rect.width)
  const height = Math.min(bounds.height, rect.height)
  return {
    x: Math.min(Math.max(bounds.x, rect.x), rect.x + rect.width - width),
    y: Math.min(Math.max(bounds.y, rect.y), rect.y + rect.height - height),
    width,
    height,
  }
}

function intersectionArea(a: Rectangle, b: Rectangle): number {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)

  if (right <= left || bottom <= top) {
    return 0
  }

  return (right - left) * (bottom - top)
}
