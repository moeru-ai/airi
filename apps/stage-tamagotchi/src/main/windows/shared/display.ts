import type { BrowserWindow, Rectangle } from 'electron'

import { screen } from 'electron'

export function currentDisplayBounds(window: BrowserWindow) {
  const bounds = window.getBounds()
  const nearbyDisplay = screen.getDisplayMatching(bounds)

  return nearbyDisplay.bounds
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
