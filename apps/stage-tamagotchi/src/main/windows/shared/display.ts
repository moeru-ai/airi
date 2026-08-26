import type { BrowserWindow, Rectangle } from 'electron'

import type { DisplayArea } from '../../../shared/utils/electron/display'

import { screen } from 'electron'

import { findDominantDisplayArea } from '../../../shared/utils/electron/display'

export interface DominantDisplayResizeOptions {
  /** Current window bounds in Electron display coordinates. */
  currentBounds: Rectangle
  /** Displays from Electron screen APIs. */
  displays: readonly DisplayArea[]
  /** Desired size before display work-area clamping. */
  targetSize: Pick<Rectangle, 'height' | 'width'>
}

type Size = number | SizeActual | SizePercentage

interface SizeActual { actual: number }

interface SizePercentage { percentage: number }

/**
 * Centers and reveals an Electron window on the display matching its current bounds.
 *
 * Use when:
 * - A renderer requests recovery of an off-screen AIRI window
 * - A hidden window must become visible after its position is restored
 *
 * Expects:
 * - The window is alive and supports Electron's bounds APIs
 *
 * Returns:
 * - The centered bounds applied to the window
 */
export function centerWindowOnDisplay(window: Pick<BrowserWindow, 'getBounds' | 'isDestroyed' | 'setBounds' | 'show'> | undefined): Rectangle {
  if (!window || window.isDestroyed())
    throw new Error('Main AIRI window is not available.')

  const windowBounds = window.getBounds()
  const displayWorkArea = screen.getDisplayMatching(windowBounds).workArea
  const centeredBounds = computeCenteredWindowBounds({ displayWorkArea, windowBounds })

  window.setBounds(centeredBounds)
  window.show()

  return centeredBounds
}

/**
 * Computes bounds that center a window inside an Electron display work area.
 *
 * Use when:
 * - Recovering a desktop window that was moved outside the visible work area
 * - Preserving the current window size while changing only its position
 *
 * Expects:
 * - Both rectangles use Electron logical display coordinates
 * - The display work area excludes menu bars, docks, and taskbars
 *
 * Returns:
 * - Centered bounds that preserve the window width and height
 */
export function computeCenteredWindowBounds(options: {
  displayWorkArea: Rectangle
  windowBounds: Rectangle
}): Rectangle {
  const centeredOffsetX = Math.floor((options.displayWorkArea.width - options.windowBounds.width) / 2)
  const centeredOffsetY = Math.floor((options.displayWorkArea.height - options.windowBounds.height) / 2)

  return {
    height: options.windowBounds.height,
    width: options.windowBounds.width,
    x: options.displayWorkArea.x + Math.max(0, centeredOffsetX),
    y: options.displayWorkArea.y + Math.max(0, centeredOffsetY),
  }
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
      height: targetHeight,
      width: targetWidth,
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
    height,
    width,
    x: Math.round(clamp(x, workArea.x, workAreaRight - width)),
    y: Math.round(clamp(y, workArea.y, workAreaBottom - height)),
  }
}
export function currentDisplayBounds(window: BrowserWindow) {
  const bounds = window.getBounds()
  const nearbyDisplay = screen.getDisplayMatching(bounds)

  return nearbyDisplay.bounds
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

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
  '2xl': { max: 1791, min: 1536 },
  '3xl': { max: 2047, min: 1792 },
  '4xl': { max: 2303, min: 2048 },
  '5xl': { max: 2559, min: 2304 },
  '6xl': { max: 2815, min: 2560 },
  '7xl': { max: 3071, min: 2816 },
  '8xl': { max: 3327, min: 3072 },
  '9xl': { max: 3583, min: 3328 },
  '10xl': { max: Infinity, min: 3584 },
  'lg': { max: 1279, min: 1024 },
  'md': { max: 1023, min: 768 },
  'sm': { max: 767, min: 640 },
  'xl': { max: 1535, min: 1280 },
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
  '2k': { max: 2560, min: 1921 },
  '4k': { max: 3840, min: 2561 },
  '5k': { max: 7680, min: 3841 },
  '8k': { max: Infinity, min: 7681 },
  '720p': { max: 1280, min: 0 },
  '1080p': { max: 1920, min: 1281 },
}

export interface AdjacentPositionResult {
  height: number
  scale: number
  width: number
  x: number
  y: number
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
  targetSize: { height: number, width: number },
  workArea: Rectangle,
  options?: { margin?: number, minScale?: number },
): AdjacentPositionResult {
  const margin = options?.margin ?? 16
  const minScale = options?.minScale ?? 0.5

  const waRight = workArea.x + workArea.width
  const waBottom = workArea.y + workArea.height

  const rightSpace = { h: workArea.height, w: waRight - (anchorBounds.x + anchorBounds.width + margin) }
  const leftSpace = { h: workArea.height, w: anchorBounds.x - workArea.x - margin }
  const bottomSpace = { h: waBottom - (anchorBounds.y + anchorBounds.height + margin), w: workArea.width }

  function maxScale(space: { h: number, w: number }): number {
    if (space.w <= 0 || space.h <= 0)
      return 0
    return Math.min(space.w / targetSize.width, space.h / targetSize.height, 1)
  }

  const candidates: { scale: number, side: 'bottom' | 'left' | 'right' }[] = [
    { scale: maxScale(rightSpace), side: 'right' },
    { scale: maxScale(leftSpace), side: 'left' },
    { scale: maxScale(bottomSpace), side: 'bottom' },
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
    case 'bottom': {
      const y = anchorBounds.y + anchorBounds.height + margin
      const x = anchorBounds.x + Math.floor((anchorBounds.width - w) / 2)
      return { height: h, scale, width: w, x: clampX(x), y: clampY(y) }
    }
    case 'left': {
      const x = anchorBounds.x - w - margin
      return { height: h, scale, width: w, x: clampX(x), y: clampY(centerY) }
    }
    case 'right': {
      const x = anchorBounds.x + anchorBounds.width + margin
      return { height: h, scale, width: w, x: clampX(x), y: clampY(centerY) }
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
export function heightFrom(bounds: Rectangle, sizeOptions: Size & { max?: Size, min?: Size }) {
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

/**
 * Achieve responsive sizes based on screen width breakpoints.
 * @see {@link https://tailwindcss.com/docs/responsive-design#overview}
 */
export function mapForBreakpoints<
  B extends Record<string, { max: number, min: number }> = typeof tailwindBreakpoints,
>(
  basedOn: number,
  sizes: number | { [key in keyof B]?: number },
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
    .map(([key, value]) => ({ key, min: breakpoints[key as keyof typeof breakpoints]?.min ?? 0, value }))
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
export function widthFrom(bounds: Rectangle, sizeOptions: Size & { max?: Size, min?: Size }) {
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
