/** The vertical place of a row: the same shape as `RowGeometry` of the draw functions. */
interface ValueGeometry {
  top: number
  height: number
}

/** The value range that the height of a row shows: `low` at the bottom edge, `high` at the top edge. */
export type ValueRange = readonly [low: number, high: number]

/**
 * The y offset of a value in a row, in CSS pixels from the top of the canvas. A value outside the range maps outside
 * the row, so a caller that must stay in the row clamps the value first.
 *
 * @example
 * valueToY([-1, 1], { top: 10, height: 100 }, 0)
 * // => 60
 */
export function valueToY(range: ValueRange, geometry: ValueGeometry, value: number): number {
  const [low, high] = range
  return geometry.top + geometry.height - ((value - low) / (high - low || 1)) * geometry.height
}

/**
 * The value at a y offset in a row, the inverse of {@link valueToY}. It does not clamp.
 *
 * @example
 * yToValue([-1, 1], { top: 10, height: 100 }, 60)
 * // => 0
 */
export function yToValue(range: ValueRange, geometry: ValueGeometry, y: number): number {
  const [low, high] = range
  return low + ((geometry.top + geometry.height - y) / (geometry.height || 1)) * (high - low)
}
