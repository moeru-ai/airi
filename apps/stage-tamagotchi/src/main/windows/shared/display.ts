import type { BrowserWindow, Rectangle } from 'electron'

import { screen } from 'electron'

export function currentDisplayBounds(window: BrowserWindow) {
  const bounds = window.getBounds()
  const nearbyDisplay = screen.getDisplayMatching(bounds)

  return nearbyDisplay.bounds
}

export interface ResizableDisplayArea {
  /** Full display bounds used to decide which physical display owns most of a window. */
  bounds: Rectangle
  /** Usable display area used for quadrant anchoring and final window clamping. */
  workArea: Rectangle
}

export interface DominantDisplayResizeOptions {
  /** Current window bounds in Electron display coordinates. */
  currentBounds: Rectangle
  /** Desired size before display work-area clamping. */
  targetSize: Pick<Rectangle, 'width' | 'height'>
  /** Displays from Electron screen APIs. */
  displays: readonly ResizableDisplayArea[]
}

/**
 * Computes resize bounds from the display that owns most of the current window.
 */
export function computeResizedBoundsAnchoredToDominantDisplay(options: DominantDisplayResizeOptions): Rectangle {
  const targetWidth = Math.round(options.targetSize.width)
  const targetHeight = Math.round(options.targetSize.height)
  const display = findDominantDisplayArea(options.currentBounds, options.displays)

  if (!display) {
    return {
      ...options.currentBounds,
      width: targetWidth,
      height: targetHeight,
    }
  }

  const workArea = display.workArea

  // Target sizes may come from a larger display preset. Clamp them before
  // deriving anchors so the right/bottom edge math never asks for coordinates
  // outside the selected display's usable area.
  const width = Math.min(targetWidth, workArea.width)
  const height = Math.min(targetHeight, workArea.height)
  const workAreaRight = workArea.x + workArea.width
  const workAreaBottom = workArea.y + workArea.height
  const currentRight = options.currentBounds.x + options.currentBounds.width
  const currentBottom = options.currentBounds.y + options.currentBounds.height

  // The quadrant is based on the current window center, not the top-left
  // corner, so a window crossing displays behaves according to where most of
  // the visible window lives inside the selected work area.
  const currentCenterX = options.currentBounds.x + options.currentBounds.width / 2
  const currentCenterY = options.currentBounds.y + options.currentBounds.height / 2
  const workAreaCenterX = workArea.x + workArea.width / 2
  const workAreaCenterY = workArea.y + workArea.height / 2

  // Left/top quadrants keep the original x/y. Right/bottom quadrants keep the
  // opposite edge visually fixed by subtracting the new size from the current
  // right/bottom edge.
  const x = currentCenterX > workAreaCenterX
    ? currentRight - width
    : options.currentBounds.x
  const y = currentCenterY > workAreaCenterY
    ? currentBottom - height
    : options.currentBounds.y

  // The anchor can still land just outside the work area when the previous
  // window crossed a screen boundary. Clamp after anchoring so resize intent
  // wins first, then display safety.
  return {
    x: Math.round(clamp(x, workArea.x, workAreaRight - width)),
    y: Math.round(clamp(y, workArea.y, workAreaBottom - height)),
    width,
    height,
  }
}

/**
 * Finds the display that owns the largest visible share of `bounds`.
 */
export function findDominantDisplayArea(bounds: Rectangle, displays: readonly ResizableDisplayArea[]): ResizableDisplayArea | undefined {
  let dominantDisplay: ResizableDisplayArea | undefined
  let dominantArea = -1

  for (const display of displays) {
    // Use full display bounds, not workArea. Menu bars and docks shrink
    // workArea, but they should not change which physical display owns a
    // cross-screen window.
    const area = intersectionArea(bounds, display.bounds)
    if (area > dominantArea) {
      dominantDisplay = display
      dominantArea = area
    }
  }

  return dominantDisplay
}

function intersectionArea(a: Rectangle, b: Rectangle): number {
  // Each side of the overlap rectangle is the inner edge from the two source
  // rectangles. If the right edge crosses the left edge, or bottom crosses top,
  // the rectangles do not overlap.
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)

  if (right <= left || bottom <= top) {
    return 0
  }

  return (right - left) * (bottom - top)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface SizeActual { actual: number }
interface SizePercentage { percentage: number }
type Size = SizeActual | SizePercentage | number

function evaluateSize(basedOn: number, size: Size) {
  if (typeof size === 'number') {
    return size
  }
  if ('actual' in size) {
    return size.actual
  }

  return Math.floor(basedOn * size.percentage)
}

/**
 * Breakpoint prefix Minimum width CSS
 * sm 40rem (640px) @media (width >= 40rem) { ... }
 * md 48rem (768px) @media (width >= 48rem) { ... }
 * lg 64rem (1024px) @media (width >= 64rem) { ... }
 * xl 80rem (1280px) @media (width >= 80rem) { ... }
 * 2xl 96rem (1536px) @media (width >= 96rem) { ... }
 *
 * Additional to tailwindcss defaults:
 * 3xl 112rem (1792px) @media (width >= 112rem) { ... }
 * 4xl 128rem (2048px) @media (width >= 128rem) { ... }
 * 5xl 144rem (2304px) @media (width >= 144rem) { ... }
 * 6xl 160rem (2560px) @media (width >= 160rem) { ... }
 * 7xl 176rem (2816px) @media (width >= 176rem) { ... }
 * 8xl 192rem (3072px) @media (width >= 192rem) { ... }
 * 9xl 208rem (3328px) @media (width >= 208rem) { ... }
 * 10xl 224rem (3584px) @media (width >= 224rem) { ... }
 */
export const tailwindBreakpoints = {
  'sm': { min: 640, max: 767 },
  'md': { min: 768, max: 1023 },
  'lg': { min: 1024, max: 1279 },
  'xl': { min: 1280, max: 1535 },
  '2xl': { min: 1536, max: 1791 },
  '3xl': { min: 1792, max: 2047 },
  '4xl': { min: 2048, max: 2303 },
  '5xl': { min: 2304, max: 2559 },
  '6xl': { min: 2560, max: 2815 },
  '7xl': { min: 2816, max: 3071 },
  '8xl': { min: 3072, max: 3327 },
  '9xl': { min: 3328, max: 3583 },
  '10xl': { min: 3584, max: Infinity },
}

/**
 * Common screen resolution breakpoints.
 * Mainly for reference or if you want to target specific screen resolutions.
 *
 * - 720p HD 1280×720
 * - 1080p FHD 1920×1080
 * - 2K QHD 2560×1440
 * - 4K UHD 3840×2160
 * - 5K 5120×2880
 * - 8K UHD 7680×4320
 *
 * @see {@link https://en.wikipedia.org/wiki/Display_resolution#Common_display_resolutions}
 */
export const resolutionBreakpoints = {
  '720p': { min: 0, max: 1280 },
  '1080p': { min: 1281, max: 1920 },
  '2k': { min: 1921, max: 2560 },
  '4k': { min: 2561, max: 3840 },
  '5k': { min: 3841, max: 7680 },
  '8k': { min: 7681, max: Infinity },
}

/**
 * Achieve responsive sizes based on screen width breakpoints.
 * @see {@link https://tailwindcss.com/docs/responsive-design#overview}
 */
export function mapForBreakpoints<
  B extends Record<string, { min: number, max: number }> = typeof tailwindBreakpoints,
>(
  basedOn: number,
  sizes: { [key in keyof B]?: number } | number,
  options?: { breakpoints: B },
) {
  if (typeof sizes === 'number') {
    return sizes
  }

  const breakpoints = options?.breakpoints ?? tailwindBreakpoints

  const matched = Object.entries(breakpoints).find(([, b]) => {
    return basedOn >= b.min && basedOn <= b.max
  })

  if (matched) {
    const size = sizes[matched[0]]
    if (size) {
      return size
    }
  }

  // Fallback: find nearest-least smallest breakpoint
  const sortedSizes = Object.entries(sizes)
    .map(([key, value]) => ({ key, value, min: breakpoints[key as keyof typeof breakpoints]?.min ?? 0 }))
    .sort((a, b) => b.min - a.min) // Sort descending by min width

  const fallback = sortedSizes.find(s => s.min <= basedOn)

  return fallback?.value ?? Object.values(sizes)?.[0] ?? 0
}

/**
 * Calculate width based on options similar to how Web CSS does it.
 *
 * @param bounds
 * @param sizeOptions
 * @returns width in pixels
 */
export function widthFrom(bounds: Rectangle, sizeOptions: Size & { min?: Size, max?: Size }) {
  const val = evaluateSize(bounds.width, sizeOptions)
  const min = sizeOptions.min ? evaluateSize(bounds.width, sizeOptions.min) : undefined
  const max = sizeOptions.max ? evaluateSize(bounds.width, sizeOptions.max) : undefined

  if (min && val < min) {
    return min
  }

  if (max && val > max) {
    return max
  }

  return val
}

export interface AdjacentPositionResult {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

/**
 * Compute a position for `target` adjacent to `anchor`, staying within `workArea`.
 *
 * Compares available space on right, left, and bottom of the anchor and picks the
 * side with the most room. Tie-breaking preference: right > left > bottom.
 *
 * If the target doesn't fit at full size on the best side, it is scaled down
 * (preserving aspect ratio) to fit, respecting `minScale`.
 */
export function computeAdjacentPosition(
  anchorBounds: Rectangle,
  targetSize: { width: number, height: number },
  workArea: Rectangle,
  options?: { margin?: number, minScale?: number },
): AdjacentPositionResult {
  const margin = options?.margin ?? 16
  const minScale = options?.minScale ?? 0.5

  const waRight = workArea.x + workArea.width
  const waBottom = workArea.y + workArea.height

  const rightSpace = { w: waRight - (anchorBounds.x + anchorBounds.width + margin), h: workArea.height }
  const leftSpace = { w: anchorBounds.x - workArea.x - margin, h: workArea.height }
  const bottomSpace = { w: workArea.width, h: waBottom - (anchorBounds.y + anchorBounds.height + margin) }

  function maxScale(space: { w: number, h: number }): number {
    if (space.w <= 0 || space.h <= 0)
      return 0
    return Math.min(space.w / targetSize.width, space.h / targetSize.height, 1)
  }

  const candidates: { side: 'right' | 'left' | 'bottom', scale: number }[] = [
    { side: 'right', scale: maxScale(rightSpace) },
    { side: 'left', scale: maxScale(leftSpace) },
    { side: 'bottom', scale: maxScale(bottomSpace) },
  ]

  candidates.sort((a, b) => b.scale - a.scale)
  const best = candidates[0]!

  const scale = Math.max(best.scale, minScale)
  const w = Math.round(targetSize.width * scale)
  const h = Math.round(targetSize.height * scale)

  const clampX = (x: number) => Math.min(Math.max(x, workArea.x), waRight - w)
  const clampY = (y: number) => Math.min(Math.max(y, workArea.y), waBottom - h)

  const centerY = anchorBounds.y + Math.floor((anchorBounds.height - h) / 2)

  switch (best.side) {
    case 'right': {
      const x = anchorBounds.x + anchorBounds.width + margin
      return { x: clampX(x), y: clampY(centerY), width: w, height: h, scale }
    }
    case 'left': {
      const x = anchorBounds.x - w - margin
      return { x: clampX(x), y: clampY(centerY), width: w, height: h, scale }
    }
    case 'bottom': {
      const y = anchorBounds.y + anchorBounds.height + margin
      const x = anchorBounds.x + Math.floor((anchorBounds.width - w) / 2)
      return { x: clampX(x), y: clampY(y), width: w, height: h, scale }
    }
  }
}

/**
 * Calculate height based on options similar to how Web CSS does it.
 *
 * @param bounds
 * @param sizeOptions
 * @returns height in pixels
 */
export function heightFrom(bounds: Rectangle, sizeOptions: Size & { min?: Size, max?: Size }) {
  const val = evaluateSize(bounds.height, sizeOptions)
  const min = sizeOptions.min ? evaluateSize(bounds.height, sizeOptions.min) : undefined
  const max = sizeOptions.max ? evaluateSize(bounds.height, sizeOptions.max) : undefined

  if (min && val < min) {
    return min
  }

  if (max && val > max) {
    return max
  }

  return val
}
