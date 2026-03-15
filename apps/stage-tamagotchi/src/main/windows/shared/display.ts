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
