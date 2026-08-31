import type { Rectangle } from 'electron'

import { clamp } from 'es-toolkit'

/**
 * The parts of an Electron `Display` this module needs: the full physical
 * `bounds` (used to decide which monitor a window belongs to) and the
 * `workArea` (excludes the taskbar/dock, used to place the window).
 */
export interface DisplayLike {
  bounds: Rectangle
  workArea: Rectangle
}

/** Area of the overlap between two rectangles (0 when they do not intersect). */
function intersectionArea(a: Rectangle, b: Rectangle): number {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const width = right - left
  const height = bottom - top
  return width > 0 && height > 0 ? width * height : 0
}

/** Move `bounds` so they sit fully within `rect` (position only; size preserved, shrunk only if larger than `rect`). */
function clampWithin(bounds: Rectangle, rect: Rectangle): Rectangle {
  const width = Math.min(bounds.width, rect.width)
  const height = Math.min(bounds.height, rect.height)
  return {
    x: clamp(bounds.x, rect.x, rect.x + rect.width - width),
    y: clamp(bounds.y, rect.y, rect.y + rect.height - height),
    width,
    height,
  }
}

/** Center a window of the given size within `rect`. */
function centerWithin(size: { width: number, height: number }, rect: Rectangle): Rectangle {
  const width = Math.min(size.width, rect.width)
  const height = Math.min(size.height, rect.height)
  return {
    x: Math.round(rect.x + (rect.width - width) / 2),
    y: Math.round(rect.y + (rect.height - height) / 2),
    width,
    height,
  }
}

/**
 * Validate persisted window bounds against the currently available displays so a
 * reachable portion of the window always stays on-screen.
 *
 * Use when:
 * - Restoring a window position saved in a previous session, which may now be
 *   off-screen (dragged past a display edge and persisted) or on a monitor that
 *   is no longer connected.
 *
 * Behavior:
 * - Pick the display physically containing most of the window, measured against
 *   full display `bounds` (not `workArea`) so a window over a taskbar/dock strip
 *   still counts toward the monitor it visually sits on, then clamp it into that
 *   display's `workArea`.
 * - If the window no longer intersects any display, fall back to centering on the
 *   primary work area.
 *
 * Pure and Electron-free (takes plain rectangles) so it can be unit-tested; the
 * caller passes `screen.getAllDisplays()` and `screen.getPrimaryDisplay()`.
 */
export function sanitizePersistedWindowBounds(
  bounds: Rectangle,
  displays: DisplayLike[],
  primary: DisplayLike,
): Rectangle {
  if (displays.length === 0)
    return centerWithin(bounds, primary.workArea)

  let best = displays[0]
  let bestArea = -1
  for (const display of displays) {
    const area = intersectionArea(bounds, display.bounds)
    if (area > bestArea) {
      bestArea = area
      best = display
    }
  }

  // No overlap with any physical display → restore to a safe position.
  if (bestArea <= 0)
    return centerWithin(bounds, primary.workArea)

  return clampWithin(bounds, best.workArea)
}
