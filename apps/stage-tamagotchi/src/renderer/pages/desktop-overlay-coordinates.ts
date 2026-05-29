/**
 * Desktop Overlay Coordinates — screen-absolute to overlay-local mapping.
 *
 * The computer-use-mcp returns all bounding boxes and points in
 * screen-absolute logical pixels. The overlay window covers a single
 * display whose origin may be non-zero (e.g. y = -1080 when a display
 * is stacked above the primary).
 *
 * This module provides pure functions to:
 * 1. Convert screen-absolute coords to overlay-local coords
 * 2. Filter out candidates whose bounds don't intersect the overlay
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

/**
 * Convert a screen-absolute point to overlay-local coordinates.
 */
export function screenToLocal(point: Point, overlayOrigin: Point): Point {
  return {
    x: point.x - overlayOrigin.x,
    y: point.y - overlayOrigin.y,
  }
}

/**
 * Convert a screen-absolute rect to overlay-local coordinates.
 * Size is preserved; only the origin is shifted.
 */
export function screenRectToLocal(rect: Rect, overlayOrigin: Point): Rect {
  return {
    x: rect.x - overlayOrigin.x,
    y: rect.y - overlayOrigin.y,
    width: rect.width,
    height: rect.height,
  }
}

/**
 * Check whether a screen-absolute rect intersects the overlay bounds.
 * Used to filter out candidates that are entirely on another display.
 */
export function rectIntersectsOverlay(rect: Rect, overlayBounds: Rect): boolean {
  return (
    rect.x < overlayBounds.x + overlayBounds.width
    && rect.x + rect.width > overlayBounds.x
    && rect.y < overlayBounds.y + overlayBounds.height
    && rect.y + rect.height > overlayBounds.y
  )
}

/**
 * Check whether a screen-absolute point is within the overlay bounds.
 */
export function pointInOverlay(point: Point, overlayBounds: Rect): boolean {
  return (
    point.x >= overlayBounds.x
    && point.x < overlayBounds.x + overlayBounds.width
    && point.y >= overlayBounds.y
    && point.y < overlayBounds.y + overlayBounds.height
  )
}
