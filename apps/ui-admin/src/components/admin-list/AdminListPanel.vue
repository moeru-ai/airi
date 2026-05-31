<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

export interface AdminListColumn {
  key: string
  label: string
  sortable?: boolean
}

export interface AdminListFilter {
  key: string
  label: string
  value: string
  options: Array<{
    label: string
    value: string
  }>
}

const props = withDefaults(defineProps<{
  columns: AdminListColumn[]
  currentPage: number
  emptyLabel: string
  filters?: AdminListFilter[]
  initialLoading: boolean
  loading: boolean
  loadingPage?: number | null
  pageEnd: number
  pageStart: number
  search: string
  searchPlaceholder: string
  sortDirection: 'asc' | 'desc'
  sortKey: string
  tableClass?: string
  title: string
  totalItems: number
  totalPages: number
  description?: string
}>(), {
  description: '',
  filters: () => [],
  loadingPage: null,
  tableClass: '',
})

const emit = defineEmits<{
  filter: [key: string, value: string]
  page: [page: number]
  search: [value: string]
  sort: [key: string]
}>()

const searchDraft = shallowRef(props.search)
const pageDraft = shallowRef(String(props.currentPage))

const hasPreviousPage = computed(() => props.currentPage > 1)
const hasNextPage = computed(() => props.currentPage < props.totalPages)

watch(() => props.search, (value) => {
  searchDraft.value = value
})

watch(() => props.currentPage, (page) => {
  pageDraft.value = String(page)
})

function submitSearch() {
  emit('search', searchDraft.value)
}

function submitPage() {
  const parsed = Number(pageDraft.value)
  if (!Number.isFinite(parsed))
    return
  emit('page', Math.min(Math.max(1, Math.trunc(parsed)), props.totalPages))
}
</script>

<template>
  <section class="panel overflow-hidden">
    <div class="flex flex-col gap-3 border-b border-neutral-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-sm font-semibold">
          {{ title }}
        </h2>
        <p v-if="description" class="mt-1 text-sm text-neutral-500">
          {{ description }}
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <slot name="actions" />
        <form class="min-w-0 flex gap-2" @submit.prevent="submitSearch">
          <input v-model="searchDraft" class="field w-72" :placeholder="searchPlaceholder" type="search">
          <button class="btn btn-secondary" type="submit">
            <span class="i-lucide-search" />
            Search
          </button>
        </form>
        <label v-for="filter in filters" :key="filter.key" class="flex items-center gap-2 text-sm text-neutral-500">
          {{ filter.label }}
          <select class="field w-36" :value="filter.value" @change="emit('filter', filter.key, ($event.target as HTMLSelectElement).value)">
            <option v-for="option in filter.options" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="table" :class="tableClass">
        <slot name="colgroup" />
        <thead>
          <tr>
            <th v-for="column in columns" :key="column.key">
              <button
                v-if="column.sortable"
                class="inline-flex items-center gap-1 text-left font-semibold"
                type="button"
                @click="emit('sort', column.key)"
              >
                {{ column.label }}
                <span v-if="sortKey === column.key" :class="sortDirection === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" />
                <span v-else class="i-lucide-arrow-up-down text-neutral-400" />
              </button>
              <span v-else>{{ column.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="initialLoading">
            <tr v-for="index in 6" :key="index">
              <td v-for="column in columns" :key="column.key">
                <div class="h-4 w-24 animate-pulse rounded bg-neutral-200" />
              </td>
            </tr>
          </template>
          <slot v-else name="rows" />
        </tbody>
      </table>
    </div>

    <div v-if="totalItems === 0 && !loading" class="empty-state">
      <span class="i-lucide-list-filter text-2xl" />
      {{ emptyLabel }}
    </div>

    <div v-if="loading && !initialLoading" class="border-t border-neutral-100 px-5 py-3 text-sm text-neutral-500">
      <span class="inline-flex items-center gap-2">
        <span class="i-lucide-loader-2 animate-spin" />
        Loading page {{ loadingPage ?? currentPage }}
      </span>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div class="text-sm text-neutral-500">
        Page {{ currentPage }} of {{ totalPages }} · {{ pageStart }}-{{ pageEnd }} of {{ totalItems.toLocaleString() }} items
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <form class="flex items-center gap-2" @submit.prevent="submitPage">
          <span class="text-sm text-neutral-500">Go to</span>
          <input
            v-model="pageDraft"
            class="field w-20 text-center"
            inputmode="numeric"
            min="1"
            :max="totalPages"
            type="number"
          >
          <button class="btn btn-secondary" :disabled="loading" type="submit">
            <span v-if="loading" class="i-lucide-loader-2 animate-spin" />
            Go
          </button>
        </form>
        <button class="btn btn-secondary" :disabled="loading || !hasPreviousPage" type="button" @click="emit('page', currentPage - 1)">
          <span :class="loading && loadingPage === currentPage - 1 ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-chevron-left'" />
          Previous
        </button>
        <button class="btn btn-secondary" :disabled="loading || !hasNextPage" type="button" @click="emit('page', currentPage + 1)">
          Next
          <span :class="loading && loadingPage === currentPage + 1 ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-chevron-right'" />
        </button>
      </div>
    </div>
  </section>
</template>
