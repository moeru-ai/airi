/** A sorted numeric column, for example `Float64Array`. */
export interface SortedColumn {
  readonly [index: number]: number
}

/**
 * The first index in `[0, count)` whose value is not less than `value`. Returns `count` when every value is less.
 *
 * @example
 * lowerBound(new Float64Array([1, 3, 3, 5]), 4, 3)
 * // => 1
 */
export function lowerBound(column: SortedColumn, count: number, value: number): number {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >>> 1
    if (column[middle]! < value)
      low = middle + 1
    else
      high = middle
  }
  return low
}

/**
 * The first index in `[0, count)` whose value is greater than `value`. Returns `count` when no value is greater.
 *
 * @example
 * upperBound(new Float64Array([1, 3, 3, 5]), 4, 3)
 * // => 3
 */
export function upperBound(column: SortedColumn, count: number, value: number): number {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >>> 1
    if (column[middle]! <= value)
      low = middle + 1
    else
      high = middle
  }
  return low
}
