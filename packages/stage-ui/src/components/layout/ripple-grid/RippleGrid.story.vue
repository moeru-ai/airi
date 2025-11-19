<script setup lang="ts">
import { ref } from 'vue'
import RippleGrid from './RippleGrid.vue'

// Sectioned Data
const sections = ref([
  {
    title: 'Section 1',
    items: Array.from({ length: 25 }, (_, i) => ({ id: `s1-${i}`, label: `Item ${i + 1}` })),
  },
  {
    title: 'Section 2',
    items: Array.from({ length: 6 }, (_, i) => ({ id: `s2-${i}`, label: `Item ${i + 1}` })),
  },
])

// Flat Data
const flatItems = ref(Array.from({ length: 12 }, (_, i) => ({ id: `flat-${i}`, label: `Flat Item ${i + 1}` })))

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
    group="layout"
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
          :items-source="s => s.items"
          :key-source="i => i.id"
          :columns="{ default: 2, md: 3, xl: 4 }"
          :origin-index="lastClickedIndex"
          :animation-duration="300"
          :delay-per-unit="150"
          @item-click="handleItemClick"
        >
          <template #header="{ section }">
            <h2 text-xl font-bold mb-2>{{ section.title }}</h2>
          </template>
          <template #item="{ item, active }">
            <div
              h-24 rounded-lg flex items-center justify-center
              transition-colors duration-200
              border-2
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
          :key-source="i => i.id"
          :columns="{ default: 3, md: 4, xl: 6 }"
          :origin-index="lastClickedIndex"
          @item-click="handleItemClick"
        >
          <template #item="{ item, active }">
            <div
              h-24 rounded-lg flex items-center justify-center
              transition-colors duration-200
              border-2
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
