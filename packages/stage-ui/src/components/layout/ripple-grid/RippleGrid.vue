<script setup lang="ts" generic="TSection, TItem">
import { useGridRipple } from './useGridRipple'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  sections?: TSection[]
  items?: TItem[]
  itemsSource?: (section: TSection) => TItem[]
  keySource?: (item: TItem) => string | number
  columns?: number | Record<string, number>
  originIndex?: number
  animationInitial?: Record<string, any>
  animationEnter?: Record<string, any>
  animationDuration?: number
  delayPerUnit?: number
}>(), {
  columns: () => ({ default: 1, sm: 2, xl: 3 }),
  originIndex: 0,
  animationInitial: () => ({ opacity: 0, y: 10 }),
  animationEnter: () => ({ opacity: 1, y: 0 }),
  animationDuration: 250,
  delayPerUnit: 80,
})

const emit = defineEmits<{
  itemClick: [payload: { item: TItem, globalIndex: number }]
}>()

const breakpoints = useBreakpoints(breakpointsTailwind)

const COLUMN_ORDER = ['2xl', 'xl', 'lg', 'md', 'sm'] as const

// class names need to be hard-coded for tailwind to work
const GRID_COLS_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
  8: 'grid-cols-8',
  9: 'grid-cols-9',
  10: 'grid-cols-10',
  11: 'grid-cols-11',
  12: 'grid-cols-12',
} as const

const normalizedSections = computed(() => {
  if (props.sections) {
    return props.sections
  }
  if (props.items) {
    return [{ items: props.items }] as any[]
  }
  return []
})

const getItems = (section: any) => {
  if (props.itemsSource) {
    return props.itemsSource(section)
  }
  return section.items
}

const getKey = (item: any) => {
  if (props.keySource) {
    return props.keySource(item)
  }
  return item.id || item.key || JSON.stringify(item)
}

const currentCols = computed(() => {
  if (typeof props.columns === 'number') {
    return props.columns
  }

  for (const key of COLUMN_ORDER) {
    if (props.columns[key] && breakpoints.greaterOrEqual(key).value) {
      return props.columns[key]
    }
  }

  return props.columns.default || 1
})


const gridClass = computed(() => {
  return GRID_COLS_CLASSES[currentCols.value] || GRID_COLS_CLASSES['1']
})

const { getDelay } = useGridRipple({
  cols: currentCols,
  originIndex: () => props.originIndex,
  delayPerUnit: props.delayPerUnit,
})

const sectionStartIndices = computed(() => {
  const indices: number[] = []
  let current = 0
  for (const section of normalizedSections.value) {
    indices.push(current)
    current += getItems(section).length
  }
  return indices
})

function handleItemClick(item: TItem, globalIndex: number) {
  emit('itemClick', { item, globalIndex })
}
</script>

<template>
  <div flex flex-col gap-5>
    <template v-for="(section, sectionIndex) in normalizedSections" :key="sectionIndex">
      <div v-if="$slots.header && props.sections" :class="{ 'my-5': sectionIndex > 0 }">
        <slot name="header" :section="section" :index="sectionIndex" />
      </div>

      <div grid gap-4 :class="gridClass">
        <div
          v-for="(item, itemIndex) in getItems(section)"
          :key="getKey(item)"
          v-motion
          :initial="animationInitial"
          :enter="{
            ...animationEnter,
            transition: {
              duration: animationDuration,
              delay: getDelay(sectionStartIndices[sectionIndex] + itemIndex),
            },
          }"
          @click="handleItemClick(item, sectionStartIndices[sectionIndex] + itemIndex)"
        >
          <slot
            name="item"
            :item="item"
            :index="sectionStartIndices[sectionIndex] + itemIndex"
            :active="originIndex === sectionStartIndices[sectionIndex] + itemIndex"
          />
        </div>
      </div>
    </template>
  </div>
</template>
