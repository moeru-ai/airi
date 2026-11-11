import type { AiriDesktopDisplayBounds } from './eventa'

/** Display geometry that is safe to use in main and renderer processes. */
export interface DisplayArea {
  /** Full bounds used to decide which display owns a cross-screen window. */
  bounds: AiriDesktopDisplayBounds
  /** Usable bounds that exclude the system menu bar, dock, or taskbar. */
  workArea: AiriDesktopDisplayBounds
}

/**
 * Finds the display that owns the largest visible share of a window.
 */
export function findDominantDisplayArea(bounds: AiriDesktopDisplayBounds, displays: readonly DisplayArea[]): DisplayArea | undefined {
  let dominantDisplay: DisplayArea | undefined
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

function intersectionArea(a: AiriDesktopDisplayBounds, b: AiriDesktopDisplayBounds): number {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)

  if (right <= left || bottom <= top) {
    return 0
  }

  return (right - left) * (bottom - top)
}
