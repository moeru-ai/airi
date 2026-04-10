<script setup lang="ts">
import { computed, ref } from 'vue'

import Alert from '../misc/alert.vue'
import RadioCardDetail from './radio-card-detail.vue'

interface Item {
  id: string
  name: string
  description?: string
  deprecated?: boolean
  customizable?: boolean
}

interface Props {
  items: Item[]
  columns?: number
  searchable?: boolean
  searchPlaceholder?: string
  searchNoResultsTitle?: string
  searchNoResultsDescription?: string
  searchResultsText?: string
  customInputPlaceholder?: string
  expandButtonText?: string
  collapseButtonText?: string
  showMore?: boolean
  listClass?: string
  allowCustom?: boolean
  customOptionDescription?: string
  expandedClass?: string
  /**
   * When true, root fills a flex parent (`flex-1 min-h-0`) and only the model grid scrolls;
   * expand/collapse stays visible above the grid scroll area (e.g. onboarding modal).
   */
  fillAvailableHeight?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  columns: 2,
  searchable: true,
  searchPlaceholder: 'Search...',
  searchNoResultsTitle: 'No results found',
  searchNoResultsDescription: 'Try a different search term',
  searchResultsText: '{count} of {total} results',
  customInputPlaceholder: 'Enter custom value',
  expandButtonText: 'Show more',
  collapseButtonText: 'Show less',
  showMore: true,
  listClass: '',
  allowCustom: false,
  customOptionDescription: 'Custom Value',
  fillAvailableHeight: false,
})

const emit = defineEmits<{
  'update:customValue': [value: string]
}>()

const modelValue = defineModel<string>({ required: true })
const searchQuery = defineModel<string>('searchQuery')

const isListExpanded = ref(false)
const customValue = ref('')

const filteredItems = computed(() => {
  let result = [...props.items]

  // If a custom value is selected (and not present in items), add it to the list temporarily
  if (modelValue.value && !props.items.some(i => i.id.toLowerCase() === modelValue.value.toLowerCase())) {
    result.unshift({
      id: modelValue.value,
      name: modelValue.value,
      description: props.customOptionDescription,
      customizable: false,
    })
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(item =>
      item.name.toLowerCase().includes(query)
      || (item.description && item.description.toLowerCase().includes(query)),
    )
  }

  // Add "Use custom: ..." option if searching and custom input is allowed
  if (props.allowCustom && searchQuery.value) {
    const query = searchQuery.value
    const exactMatch = result.some(i => i.id.toLowerCase() === query.toLowerCase())
    if (!exactMatch) {
      result.push({
        id: query,
        name: query,
        description: props.customOptionDescription,
        customizable: false,
      })
    }
  }

  return result
})

const showExpandCollapseBtn = computed(() => {
  return filteredItems.value.length > props.columns
})

/**
 * Centralized layout classes for every structural element.
 * `fillAvailableHeight` fills a flex parent and scrolls only the grid;
 * the default mode uses a max-height scroll cap or a horizontal collapsed strip.
 */
const layout = computed(() => {
  const fill = props.fillAvailableHeight
  const expanded = isListExpanded.value

  let scrollContainer: string
  if (props.listClass) {
    scrollContainer = `mb-2 ${props.listClass}`
  }
  else if (expanded) {
    scrollContainer = fill
      ? 'mb-2 min-h-0 flex-1 overflow-y-auto'
      : 'mb-2 max-h-[calc(100dvh-22lh)] overflow-y-auto snap-y snap-proximity'
  }
  else {
    scrollContainer = fill ? 'mb-2 flex-shrink-0' : 'mb-2'
  }

  return {
    root: fill ? 'min-h-0 flex flex-1 flex-col' : '',
    itemsArea: fill ? 'flex min-h-0 flex-1 flex-col gap-2' : 'space-y-2',
    gridArea: fill ? 'flex min-h-0 flex-1 flex-col' : '',
    scrollContainer,
    grid: expanded
      ? 'grid grid-cols-1 gap-4 md:grid-cols-[repeat(var(--cols),minmax(0,1fr))]'
      : 'grid gap-4 grid-flow-col auto-cols-[calc((100%-(var(--cols)-1)*1rem)/var(--cols))] overflow-x-auto scrollbar-none snap-x snap-proximity',
    gridItem: expanded && !fill ? 'snap-start' : '',
    expandWrapper: fill ? 'flex-shrink-0' : '',
  }
})

function updateCustomValue(value: string) {
  customValue.value = value
  emit('update:customValue', value)
}
</script>

<template>
  <div
    :class="[
      'radio-card-detail-many-select',
      layout.root,
      isListExpanded ? props.expandedClass : '',
    ]"
  >
    <!-- Search bar -->
    <div
      v-if="searchable"
      :class="['relative inline-flex w-full flex-shrink-0 items-center']"
    >
      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <div class="i-solar:magnifer-line-duotone text-neutral-500 dark:text-neutral-400" />
      </div>
      <input
        v-model="searchQuery"
        type="search"
        :class="[
          'w-full rounded-xl border-2 border-solid border-neutral-200 bg-white p-2.5 pl-10 text-sm outline-none',
          'transition-all duration-200 ease-in-out',
          'focus:border-primary-100 dark:border-neutral-800 dark:bg-neutral-900 dark:focus:border-primary-400/50',
        ]"
        :placeholder="searchPlaceholder"
      >
    </div>

    <!-- Items list with search results info -->
    <div
      :class="[
        'mt-4',
        layout.itemsArea,
      ]"
    >
      <!-- Search results info -->
      <div v-if="searchQuery" class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ searchResultsText.replace('{count}', filteredItems.length.toString()).replace('{total}', items.length.toString()) }}
      </div>

      <!-- No search results -->
      <Alert v-if="searchQuery && filteredItems.length === 0" type="warning">
        <template #title>
          {{ searchNoResultsTitle }}
        </template>
        <template #content>
          {{ searchNoResultsDescription.replace('{query}', searchQuery) }}
        </template>
      </Alert>

      <!-- Items grid -->
      <div class="relative" :class="layout.gridArea">
        <!-- Scroll container wraps the grid to avoid display:grid + flex-1 overflow rendering bugs -->
        <div :class="layout.scrollContainer">
          <div
            :class="layout.grid"
            class="transition-all duration-200 ease-in-out"
            :style="{ '--cols': props.columns }"
          >
            <RadioCardDetail
              v-for="item in filteredItems"
              :id="item.id"
              :key="item.id"
              v-model="modelValue"
              :value="item.id"
              :title="item.name"
              :description="item.description"
              :deprecated="item.deprecated"
              :show-expand-collapse="showMore"
              :expand-collapse-threshold="100"
              :show-custom-input="item.customizable"
              :custom-input-value="customValue"
              :custom-input-placeholder="customInputPlaceholder"
              name="radio-card-detail-many-select"
              :class="layout.gridItem"
              @update:custom-input-value="updateCustomValue($event)"
            />
          </div>
        </div>

        <!-- Expand/collapse handle -->
        <div
          v-if="showExpandCollapseBtn"
          :class="[
            'rounded-xl bg-neutral-100 dark:bg-[rgba(0,0,0,0.3)]',
            isListExpanded ? 'w-full' : 'mt-4 w-full rounded-lg',
            layout.expandWrapper,
          ]"
        >
          <button
            :class="[
              'w-full flex items-center justify-center gap-2 rounded-lg py-2',
              'transition-all duration-200 ease-in-out',
              isListExpanded
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'bg-white hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800',
            ]"
            @click="isListExpanded = !isListExpanded"
          >
            <span>{{ isListExpanded ? collapseButtonText : expandButtonText }}</span>
            <div
              :class="[
                'i-solar:alt-arrow-down-linear text-lg',
                'transition-transform duration-200 ease-in-out',
                isListExpanded ? 'rotate-180' : '',
              ]"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
input[type='search']::-webkit-search-cancel-button {
  display: none;
}
</style>
