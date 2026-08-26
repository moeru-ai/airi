/**
 * Multi-display types for macOS screen enumeration and coordinate mapping.
 */

export interface DisplayDescriptor {
  /** Logical bounds in global screen coordinates */
  bounds: {
    height: number
    width: number
    x: number
    y: number
  }
  /** Display id from CGDirectDisplayID */
  displayId: number
  /** Whether the display is built-in (laptop screen) */
  isBuiltIn: boolean
  /** Whether this is the main display */
  isMain: boolean
  pixelHeight: number
  /** Physical pixel dimensions */
  pixelWidth: number
  /** Backing scale factor (2.0 = Retina) */
  scaleFactor: number
  /** Usable area excluding menu bar / dock */
  visibleBounds: {
    height: number
    width: number
    x: number
    y: number
  }
}

/**
 * Resolved position metadata for a point in AIRI's desktop coordinate space.
 *
 * The `global` coordinate is the unscaled logical point that macOS input events
 * should receive. `local` and `backingPixel` are diagnostics for display-aware
 * rendering, overlays, and Retina mismatch debugging.
 */
export interface DisplayPointResolution {
  /** Point relative to the containing display in backing pixels. */
  backingPixel: {
    x: number
    y: number
  }
  /** Display containing the global logical point. */
  display: DisplayDescriptor
  /** Original point in global logical screen coordinates. */
  global: {
    x: number
    y: number
  }
  /** Point relative to the containing display in logical coordinates. */
  local: {
    x: number
    y: number
  }
}

export interface MultiDisplaySnapshot {
  capturedAt: string
  /** Total bounding rect across all displays in logical coords */
  combinedBounds: {
    height: number
    width: number
    x: number
    y: number
  }
  displays: DisplayDescriptor[]
}

/**
 * Given a logical screen point, find which display it belongs to.
 */
export function findDisplayForPoint(
  snapshot: MultiDisplaySnapshot,
  x: number,
  y: number,
): DisplayDescriptor | undefined {
  return snapshot.displays.find((d) => {
    const b = d.bounds
    return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height
  })
}

/**
 * Resolves a global logical point against the display snapshot.
 *
 * Use when:
 * - Mapping desktop mutation targets to a concrete macOS display
 * - Recording display-local and backing-pixel diagnostics
 *
 * Expects:
 * - `snapshot` uses AIRI's top-left global logical coordinate space
 * - `x` and `y` are not pre-scaled by Retina backing factor
 *
 * Returns:
 * - Display metadata when the point is inside a connected display
 * - `undefined` when the point is outside all display bounds
 */
export function resolveDisplayPoint(
  snapshot: MultiDisplaySnapshot,
  x: number,
  y: number,
): DisplayPointResolution | undefined {
  const display = findDisplayForPoint(snapshot, x, y)
  if (!display) {
    return undefined
  }

  const local = toDisplayLocalCoord(display, x, y)

  return {
    backingPixel: toBackingPixelCoord(display, local.x, local.y),
    display,
    global: { x, y },
    local,
  }
}

/**
 * Converts display-local logical coordinates to backing pixels.
 *
 * Use when:
 * - Rendering display-local overlay diagnostics
 * - Comparing logical desktop points with backing-pixel screenshots
 *
 * Expects:
 * - `localX` and `localY` are already relative to `display.bounds`
 *
 * Returns:
 * - Display-local backing-pixel coordinates rounded to integer pixels
 */
export function toBackingPixelCoord(
  display: DisplayDescriptor,
  localX: number,
  localY: number,
): { x: number, y: number } {
  return {
    x: Math.round(localX * display.scaleFactor),
    y: Math.round(localY * display.scaleFactor),
  }
}

/**
 * Convert a logical coordinate to the local coordinate space of a specific display.
 */
export function toDisplayLocalCoord(
  display: DisplayDescriptor,
  x: number,
  y: number,
): { x: number, y: number } {
  return {
    x: x - display.bounds.x,
    y: y - display.bounds.y,
  }
}

/**
 * Convert display-local coordinates back to global logical coordinates.
 */
export function toGlobalCoord(
  display: DisplayDescriptor,
  localX: number,
  localY: number,
): { x: number, y: number } {
  return {
    x: localX + display.bounds.x,
    y: localY + display.bounds.y,
  }
}
