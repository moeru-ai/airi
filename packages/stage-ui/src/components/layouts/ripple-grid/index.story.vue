<script setup lang="ts">
import { ref } from 'vue'

import RippleGrid from './index.vue'

const sections = ref([
  {
    title: 'Section 1',
    items: Array.from({ length: 51 }, (_, i) => ({ id: `s1-${i}`, label: `Item ${i + 1}` })),
  },
  {
    title: 'Section 2',
    items: Array.from({ length: 11 }, (_, i) => ({ id: `s2-${i}`, label: `Item ${i + 1}` })),
  },
])

const flatItems = ref(Array.from({ length: 10 }, (_, i) => ({ id: `flat-${i}`, label: `Flat Item ${i + 1}` })))

const lastClickedIndex = ref(0)
const renderKey = ref(0)

function handleItemClick({ globalIndex }: { globalIndex: number }) {
  lastClickedIndex.value = globalIndex
  renderKey.value++
}
</script>

<template>
  <Story
    title="RippleGrid"
    group="common"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <Variant
      id="sections"
      title="With Sections"
    >
      <div p-4>
        <RippleGrid
          :key="renderKey"
          :sections="sections"
          :get-items="s => s.items"
          :get-key="i => i.id"
          :columns="{ default: 6, md: 8, xl: 10 }"
          :origin-index="lastClickedIndex"
          @item-click="handleItemClick"
        >
          <template #header="{ section }">
            <h2 mb-2 text-xl font-bold>
              {{ section.title }}
            </h2>
          </template>
          <template #item="{ item, active }">
            <div

              h-24 flex items-center justify-center border-2 rounded-lg transition-colors duration-200
              :class="active ? 'bg-primary-500 text-white border-primary-600' : 'bg-neutral-100 dark:bg-neutral-800 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-700'"
            >
              {{ item.label }}
            </div>
          </template>
        </RippleGrid>
      </div>
    </Variant>

    <Variant
      id="flat"
      title="No Sections (Flat List)"
    >
      <div p-4>
        <RippleGrid
          :key="renderKey"
          :items="flatItems"
          :columns="1"
          :origin-index="lastClickedIndex"
          @item-click="handleItemClick"
        >
          <template #item="{ item, active }">
            <div

              h-24 flex items-center justify-center border-2 rounded-lg transition-colors duration-200
              :class="active ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-neutral-100 dark:bg-neutral-800 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-700'"
            >
              {{ item.label }}
            </div>
          </template>
        </RippleGrid>
      </div>
    </Variant>
  </Story>
</template>
