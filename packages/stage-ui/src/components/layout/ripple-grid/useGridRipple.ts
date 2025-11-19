import { type MaybeRefOrGetter, toValue } from 'vue'

export interface UseGridRippleOptions {
  cols: MaybeRefOrGetter<number>
  originIndex: MaybeRefOrGetter<number>
  delayPerUnit?: number
}

export function useGridRipple(options: UseGridRippleOptions) {
  const { cols, originIndex, delayPerUnit = 80 } = options

  function getDelay(index: number) {
    const numCols = toValue(cols)
    const origin = toValue(originIndex)

    const currentRow = Math.floor(index / numCols)
    const currentCol = index % numCols

    const originRow = Math.floor(origin / numCols)
    const originCol = origin % numCols

    // Manhattan distance
    const distance = Math.abs(currentRow - originRow) + Math.abs(currentCol - originCol)

    return distance * delayPerUnit
  }

  return {
    getDelay,
  }
}
