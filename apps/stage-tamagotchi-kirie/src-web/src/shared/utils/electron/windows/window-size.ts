import type { WidgetWindowSize } from '../../../eventa'

/**
 * Normalizes widget window size input before it is applied to an Electron window.
 *
 * Use when:
 * - Widget payloads provide optional window size overrides
 * - Main and renderer callers need one shared sanitization path before display clamping
 *
 * Expects:
 * - `width` and `height` are finite positive numbers when present
 *
 * Returns:
 * - A floored size object with invalid constraints removed, or `undefined` when the payload is unusable
 *
 * Before:
 * - `{ width: 620.9, height: 480.2, minWidth: -10, maxHeight: 720.8 }`
 * - `{ width: 0, height: 480 }`
 *
 * After:
 * - `{ width: 620, height: 480, maxHeight: 720 }`
 * - `undefined`
 */
export function normalizeWidgetWindowSize(
  windowSize?: WidgetWindowSize | Record<string, unknown>,
): WidgetWindowSize | undefined {
  if (!windowSize || typeof windowSize !== 'object' || Array.isArray(windowSize))
    return undefined

  const width = Number(windowSize.width)
  const height = Number(windowSize.height)

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0)
    return undefined

  const normalized: WidgetWindowSize = {
    width: Math.floor(width),
    height: Math.floor(height),
  }

  for (const key of ['minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const) {
    const value = windowSize[key]
    if (value === undefined)
      continue

    const numericValue = Number(value)
    if (Number.isFinite(numericValue) && numericValue > 0)
      normalized[key] = Math.floor(numericValue)
  }

  return normalized
}
