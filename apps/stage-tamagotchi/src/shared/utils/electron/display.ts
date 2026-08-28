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
