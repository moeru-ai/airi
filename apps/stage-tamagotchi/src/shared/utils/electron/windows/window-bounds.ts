import type { Rectangle } from 'electron'

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
  const x = Math.min(Math.max(bounds.x, rect.x), rect.x + rect.width - width)
  const y = Math.min(Math.max(bounds.y, rect.y), rect.y + rect.height - height)
  return { x, y, width, height }
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
 * Validate persisted window bounds against the currently available display work
 * areas so a reachable portion of the window always stays on-screen.
 *
 * Use when:
 * - Restoring a window position saved in a previous session, which may now be
 *   off-screen (dragged past a display edge and persisted) or on a monitor that
 *   is no longer connected.
 *
 * Behavior:
 * - If the bounds still overlap a display, clamp them fully into that display's
 *   work area (best-overlapping display wins).
 * - If they no longer intersect any display, fall back to centering on the
 *   primary work area.
 *
 * Pure and Electron-free (takes plain rectangles) so it can be unit-tested; the
 * caller passes work areas from `screen.getAllDisplays()` and the primary one.
 */
export function sanitizePersistedWindowBounds(
  bounds: Rectangle,
  workAreas: Rectangle[],
  primaryWorkArea: Rectangle,
): Rectangle {
  if (workAreas.length === 0)
    return centerWithin(bounds, primaryWorkArea)

  let best = workAreas[0]
  let bestArea = -1
  for (const workArea of workAreas) {
    const area = intersectionArea(bounds, workArea)
    if (area > bestArea) {
      bestArea = area
      best = workArea
    }
  }

  // No visible intersection with any display → restore to a safe position.
  if (bestArea <= 0)
    return centerWithin(bounds, primaryWorkArea)

  return clampWithin(bounds, best)
}
