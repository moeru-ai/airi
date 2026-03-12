/**
 * Multi-display types for macOS screen enumeration and coordinate mapping.
 */

export interface DisplayDescriptor {
  /** Display id from CGDirectDisplayID */
  displayId: number
  /** Whether this is the main display */
  isMain: boolean
  /** Whether the display is built-in (laptop screen) */
  isBuiltIn: boolean
  /** Logical bounds in global screen coordinates */
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  /** Usable area excluding menu bar / dock */
  visibleBounds: {
    x: number
    y: number
    width: number
    height: number
  }
  /** Backing scale factor (2.0 = Retina) */
  scaleFactor: number
  /** Physical pixel dimensions */
  pixelWidth: number
  pixelHeight: number
}

export interface MultiDisplaySnapshot {
  displays: DisplayDescriptor[]
  /** Total bounding rect across all displays in logical coords */
  combinedBounds: {
    x: number
    y: number
    width: number
    height: number
  }
  capturedAt: string
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
