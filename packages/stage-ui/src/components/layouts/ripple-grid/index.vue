<script setup lang="ts" generic="TSection, TItem">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { computed, toRef } from 'vue'

import { useGridRipple } from './use-grid-ripple'

interface VirtualSection {
  _isVirtual: true
  items: TItem[]
}

const props = withDefaults(
  defineProps<{
    items?: TItem[]
    sections?: TSection[]

    getItems?: (section: TSection) => TItem[]
    getKey?: (item: TItem) => string | number

    columns?: number | Record<string, number>

    originIndex?: number
    animationInitial?: Record<string, unknown>
    animationEnter?: Record<string, unknown>
    animationDuration?: number
    delayPerUnit?: number
  }>(),
  {
    columns: () => ({ default: 1, sm: 2, xl: 3 }),
    originIndex: 0,
    animationInitial: () => ({ opacity: 0, y: 10 }),
    animationEnter: () => ({ opacity: 1, y: 0 }),
    animationDuration: 250,
    delayPerUnit: 80,
    getItems: (section: TSection) => (section as VirtualSection).items || [],
    getKey: (item: TItem) => String((item as { id?: string | number; key?: string | number }).id ?? (item as { key?: string | number }).key ?? ''),
  },
)

const emit = defineEmits<{
  itemClick: [payload: { item: TItem; globalIndex: number }]
}>()

const breakpoints = useBreakpoints(breakpointsTailwind)
const COLUMN_ORDER = ['2xl', 'xl', 'lg', 'md', 'sm'] as const

const isFlat = computed(() => !!props.items && !props.sections)

const normalizedSections = computed(() => {
  if (isFlat.value && props.items) {
    return [{ _isVirtual: true, items: props.items }] as unknown as TSection[]
  }
  return props.sections || []
})
const currentCols = computed(() => {
  if (typeof props.columns === 'number') return props.columns

  const columnsMap = props.columns as Record<string, number>
  for (const key of COLUMN_ORDER) {
    if (columnsMap[key] && breakpoints.greaterOrEqual(key).value) {
      return columnsMap[key]
    }
  }
  return columnsMap.default || 1
})

const sectionMeta = computed(() => {
  let globalCounter = 0
  return normalizedSections.value.map((section) => {
    const items = isFlat.value ? (section as unknown as VirtualSection).items : props.getItems(section)
    const startIndex = globalCounter
    globalCounter += items.length
    return { items, startIndex, count: items.length }
  })
})

const sectionItemCounts = computed(() => sectionMeta.value.map((m) => m.count))

const { getDelay } = useGridRipple({
  cols: currentCols,
  originIndex: toRef(props, 'originIndex'),
  sectionItemCounts,
  delayPerUnit: props.delayPerUnit,
})

function handleItemClick(item: TItem, globalIndex: number) {
  emit('itemClick', { item, globalIndex })
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <template v-for="(section, sIndex) in normalizedSections" :key="sIndex">
      <div v-if="$slots.header && !isFlat" :class="{ 'my-5': sIndex > 0 }">
        <slot name="header" :section="section" :index="sIndex" />
      </div>

      <div
        class="grid gap-4 pb-4"
        :style="{
          gridTemplateColumns: `repeat(${currentCols}, minmax(0, 1fr))`,
        }"
      >
        <div
          v-for="(item, iIndex) in sectionMeta[sIndex].items"
          :key="props.getKey(item)"
          v-motion
          :initial="animationInitial"
          :enter="{
            ...animationEnter,
            transition: {
              duration: animationDuration,
              delay: getDelay(sectionMeta[sIndex].startIndex + iIndex),
            },
          }"
          @click="handleItemClick(item, sectionMeta[sIndex].startIndex + iIndex)"
        >
          <slot
            name="item"
            :item="item"
            :index="sectionMeta[sIndex].startIndex + iIndex"
            :active="originIndex === sectionMeta[sIndex].startIndex + iIndex"
          />
        </div>
      </div>
    </template>
  </div>
</template>
