import type { MaybeRefOrGetter } from 'vue'

import { computed, toValue } from 'vue'

export interface UseGridRippleOptions {
  cols: MaybeRefOrGetter<number>
  delayPerUnit?: number
  originIndex: MaybeRefOrGetter<number>
  sectionItemCounts: MaybeRefOrGetter<number[]>
}

export function useGridRipple(options: UseGridRippleOptions) {
  const { cols, delayPerUnit = 80, originIndex, sectionItemCounts } = options

  // to property propagate the ripple, we need to know the layout of the grid and map each item onto a coordinate
  const sectionLayout = computed(() => {
    const layout: { itemCount: number, startLinearIndex: number, startRow: number }[] = []
    let currentLinearIndex = 0
    let currentRow = 0
    const numCols = toValue(cols)
    const counts = toValue(sectionItemCounts)

    for (const count of counts) {
      const rows = Math.ceil(count / numCols)

      layout.push({
        itemCount: count,
        startLinearIndex: currentLinearIndex,
        startRow: currentRow,
      })

      currentLinearIndex += count
      currentRow += rows
    }
    return layout
  })

  // precompute the coordinates
  const coordinateMap = computed(() => {
    const map = new Map<number, { col: number, row: number }>()
    const numCols = toValue(cols)

    for (const meta of sectionLayout.value) {
      for (let i = 0; i < meta.itemCount; i++) {
        const linearIndex = meta.startLinearIndex + i
        const localRow = Math.floor(i / numCols)
        const col = i % numCols
        const row = meta.startRow + localRow
        map.set(linearIndex, { col, row })
      }
    }
    return map
  })

  function getCoordinates(linearIndex: number) {
    return coordinateMap.value.get(linearIndex) || { col: 0, row: 0 }
  }

  const originCoordinates = computed(() => getCoordinates(toValue(originIndex) || 0))

  function getDelay(index: number) {
    const target = getCoordinates(index)
    const origin = originCoordinates.value
    const distance = Math.abs(target.row - origin.row) + Math.abs(target.col - origin.col)
    return distance * delayPerUnit
  }

  return {
    getDelay,
  }
}
