<script setup lang="ts">
import { computed, ref } from 'vue'

import RadioCardDetail from './RadioCardDetail.vue'

interface Item {
  id: string
  name: string
  description?: string
  deprecated?: boolean
  customizable?: boolean
}

interface Props {
  items: Item[]
  searchable?: boolean
  searchPlaceholder?: string
  searchNoResultsTitle?: string
  searchNoResultsDescription?: string
  searchResultsText?: string
  customInputPlaceholder?: string
  expandButtonText?: string
  collapseButtonText?: string
  showMore?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  searchable: true,
  searchPlaceholder: 'Search...',
  searchNoResultsTitle: 'No results found',
  searchNoResultsDescription: 'Try a different search term',
  searchResultsText: '{count} of {total} results',
  customInputPlaceholder: 'Enter custom value',
  expandButtonText: 'Show more',
  collapseButtonText: 'Show less',
  showMore: true,
})

const emit = defineEmits<{
  'update:customValue': [value: string]
}>()

const modelValue = defineModel<string>({ required: true })

const searchQuery = ref('')
const isListExpanded = ref(false)
const customValue = ref('')

const filteredItems = computed(() => {
  if (!searchQuery.value)
    return props.items

  const query = searchQuery.value.toLowerCase()
  return props.items.filter(item =>
    item.name.toLowerCase().includes(query)
    || (item.description && item.description.toLowerCase().includes(query)),
  )
})

function updateCustomValue(value: string) {
  customValue.value = value
  emit('update:customValue', value)
}
</script>

<template>
  <div class="radio-card-detail-many-select">
    <!-- Search bar -->
    <div v-if="searchable" class="relative" inline-flex="~" w-full items-center>
      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <div i-solar:magnifer-line-duotone class="text-neutral-500 dark:text-neutral-400" />
      </div>
      <input
        v-model="searchQuery"
        type="search"
        class="w-full rounded-xl p-2.5 pl-10 text-sm outline-none"
        border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
        transition="all duration-200 ease-in-out"
        bg="white dark:neutral-900"
        :placeholder="searchPlaceholder"
      >
    </div>

    <!-- Items list with search results info -->
    <div class="mt-4 space-y-2">
      <!-- Search results info -->
      <div v-if="searchQuery" class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ searchResultsText.replace('{count}', filteredItems.length.toString()).replace('{total}', items.length.toString()) }}
      </div>

      <!-- No search results -->
      <div
        v-if="searchQuery && filteredItems.length === 0"
        class="flex items-center gap-3 border border-2 border-amber-200 rounded-xl bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
      >
        <div i-solar:info-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
        <div class="flex flex-col">
          <span class="font-medium">{{ searchNoResultsTitle }}</span>
          <span class="text-sm text-amber-600 dark:text-amber-400">
            {{ searchNoResultsDescription.replace('{query}', searchQuery) }}
          </span>
        </div>
      </div>

      <!-- Items grid -->
      <div class="relative">
        <!-- Horizontally scrollable container -->
        <div
          class="grid auto-cols-[350px] grid-flow-col max-h-[calc(100dvh-7lh)] gap-4 overflow-x-auto pb-4 scrollbar-none"
          :class="[
            isListExpanded ? 'grid-cols-1 md:grid-cols-2 grid-flow-row auto-cols-auto' : '',
          ]"
          transition="all duration-200 ease-in-out"
          style="scroll-snap-type: x mandatory;"
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
            class="scroll-snap-align-start"
            @update:custom-input-value="updateCustomValue($event)"
          />
        </div>

        <!-- Expand/collapse handle -->
        <div
          bg="neutral-100 dark:[rgba(0,0,0,0.3)]"
          rounded-xl
          :class="[
            isListExpanded ? 'w-full' : 'mt-4 w-full rounded-lg',
          ]"
        >
          <button
            w-full
            flex items-center justify-center gap-2 rounded-lg py-2 transition="all duration-200 ease-in-out"
            :class="[
              isListExpanded ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ]"
            @click="isListExpanded = !isListExpanded"
          >
            <span>{{ isListExpanded ? collapseButtonText : expandButtonText }}</span>
            <div
              :class="isListExpanded ? 'rotate-180' : ''"
              i-solar:alt-arrow-down-linear transition="transform duration-200 ease-in-out"
              class="text-lg"
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
