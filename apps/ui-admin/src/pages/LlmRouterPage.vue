<script setup lang="ts">
import type { LlmRouterEntry } from '../modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { computed, onMounted, shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import AdminListPanel from '../components/admin-list/AdminListPanel.vue'

import { adminApi } from '../modules/api'

const entries = shallowRef<LlmRouterEntry[]>([])
const selectedIndex = shallowRef(0)
const currentPage = shallowRef(1)
const savedSnapshot = shallowRef('[]')
const loading = shallowRef(true)
const search = shallowRef('')
const saving = shallowRef(false)
const sortDirection = shallowRef<'asc' | 'desc'>('asc')
const sortKey = shallowRef('name')
const statusFilter = shallowRef('all')

const knownRouteFields = new Set(['id', 'name', 'model', 'baseUrl', 'enabled', 'weight', 'apiKeyEnv'])
const pageSize = 12
const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'model', label: 'Model', sortable: true },
  { key: 'baseUrl', label: 'Base URL', sortable: true },
  { key: 'weight', label: 'Weight', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: '' },
]

const selectedEntry = computed(() => entries.value[selectedIndex.value] ?? null)
const savedEntries = computed(() => parseSavedEntries(savedSnapshot.value))
const deletedEntries = computed(() => savedEntries.value.filter(savedEntry => !entries.value.some(entry => routeKey(entry) === routeKey(savedEntry))))
const statusFilters = computed(() => [
  {
    key: 'status',
    label: 'Status',
    value: statusFilter.value,
    options: [
      { label: 'All', value: 'all' },
      { label: 'Enabled', value: 'enabled' },
      { label: 'Disabled', value: 'disabled' },
      { label: 'Changed', value: 'changed' },
    ],
  },
])
const filteredEntries = computed(() => {
  const term = search.value.trim().toLowerCase()
  return entries.value.filter((entry) => {
    if (statusFilter.value === 'enabled' && entry.enabled === false)
      return false
    if (statusFilter.value === 'disabled' && entry.enabled !== false)
      return false
    if (statusFilter.value === 'changed' && !isRouteDirty(entry))
      return false
    if (!term)
      return true
    return [
      valueFor(entry, 'id'),
      valueFor(entry, 'name'),
      valueFor(entry, 'model'),
      valueFor(entry, 'baseUrl'),
    ].some(value => value.toLowerCase().includes(term))
  })
})
const sortedEntries = computed(() => {
  const direction = sortDirection.value === 'asc' ? 1 : -1
  return [...filteredEntries.value].sort((left, right) => compareRouteValue(left, right, sortKey.value) * direction)
})
const totalPages = computed(() => Math.max(1, Math.ceil(sortedEntries.value.length / pageSize)))
const pageStart = computed(() => sortedEntries.value.length === 0 ? 0 : (currentPage.value - 1) * pageSize + 1)
const pageEnd = computed(() => Math.min(currentPage.value * pageSize, sortedEntries.value.length))
const paginatedEntries = computed(() => sortedEntries.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
const listDirty = computed(() => JSON.stringify(entries.value) !== savedSnapshot.value)
const saveStatusLabel = computed(() => {
  if (saving.value)
    return 'Saving'
  if (listDirty.value)
    return 'Unsaved changes'
  return 'Saved'
})
const selectedDirtyFields = computed(() => {
  const entry = selectedEntry.value
  if (!entry)
    return new Set<string>()
  return dirtyFieldsFor(entry)
})
const selectedAdditionalFields = computed(() => {
  const entry = selectedEntry.value
  if (!entry)
    return []
  return Object.entries(entry)
    .filter(([key]) => !knownRouteFields.has(key))
    .map(([key, value]) => ({
      key,
      value: formatFieldValue(value),
    }))
})

function parseSavedEntries(value: string): LlmRouterEntry[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed as LlmRouterEntry[] : []
  }
  catch {
    return []
  }
}

onMounted(async () => {
  try {
    const result = await adminApi.llmRouter()
    entries.value = result.entries
    savedSnapshot.value = JSON.stringify(result.entries)
    selectEntry(0)
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load LLM_ROUTER'))
  }
  finally {
    loading.value = false
  }
})

function selectEntry(index: number) {
  selectedIndex.value = index
}

function selectRoute(entry: LlmRouterEntry) {
  const index = entries.value.indexOf(entry)
  if (index >= 0)
    selectEntry(index)
}

function addEntry() {
  entries.value = [
    ...entries.value,
    {
      id: `route-${Date.now()}`,
      name: 'New Route',
      model: 'auto',
      baseUrl: '',
      enabled: true,
      weight: 1,
      apiKeyEnv: '',
    },
  ]
  selectEntry(entries.value.length - 1)
}

function removeEntry(index: number) {
  const target = paginatedEntries.value[index]
  entries.value = entries.value.filter(entry => entry !== target)
  selectEntry(Math.max(0, Math.min(selectedIndex.value, entries.value.length - 1)))
}

function updateSelectedEntry(patch: LlmRouterEntry) {
  const entry = selectedEntry.value
  if (!entry)
    return

  const next = [...entries.value]
  next[selectedIndex.value] = {
    ...entry,
    ...patch,
  }
  entries.value = next
}

async function saveAll() {
  saving.value = true
  try {
    const result = await adminApi.saveLlmRouter(entries.value)
    entries.value = result.entries
    savedSnapshot.value = JSON.stringify(result.entries)
    selectEntry(Math.min(selectedIndex.value, entries.value.length - 1))
    toast.success('LLM_ROUTER saved')
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to save LLM_ROUTER'))
  }
  finally {
    saving.value = false
  }
}

function labelFor(entry: LlmRouterEntry, index: number): string {
  return String(entry.name ?? entry.id ?? entry.model ?? `Route ${index + 1}`)
}

function routeKey(entry: LlmRouterEntry): string {
  return String(entry.id ?? entry.name ?? entry.model ?? JSON.stringify(entry))
}

function savedEntryFor(entry: LlmRouterEntry): LlmRouterEntry | null {
  return savedEntries.value.find(savedEntry => routeKey(savedEntry) === routeKey(entry)) ?? null
}

function dirtyFieldsFor(entry: LlmRouterEntry): Set<string> {
  const savedEntry = savedEntryFor(entry)
  const fields = new Set<string>()
  if (!savedEntry) {
    for (const key of Object.keys(entry))
      fields.add(key)
    return fields
  }

  const keys = new Set([...Object.keys(entry), ...Object.keys(savedEntry)])
  for (const key of keys) {
    if (JSON.stringify(entry[key]) !== JSON.stringify(savedEntry[key]))
      fields.add(key)
  }
  return fields
}

function routeChangeLabel(entry: LlmRouterEntry): string {
  if (!savedEntryFor(entry))
    return 'New'
  if (dirtyFieldsFor(entry).size > 0)
    return 'Modified'
  return ''
}

function isRouteDirty(entry: LlmRouterEntry): boolean {
  return routeChangeLabel(entry) !== ''
}

function isFieldDirty(key: string): boolean {
  return selectedDirtyFields.value.has(key)
}

function compareRouteValue(left: LlmRouterEntry, right: LlmRouterEntry, key: string): number {
  if (key === 'weight')
    return Number(left.weight ?? 0) - Number(right.weight ?? 0)
  if (key === 'status')
    return Number(left.enabled !== false) - Number(right.enabled !== false)
  return valueFor(left, key).localeCompare(valueFor(right, key))
}

function valueFor(entry: LlmRouterEntry, key: string): string {
  const value = entry[key]
  if (value == null)
    return '-'
  return formatFieldValue(value)
}

function formatFieldValue(value: unknown): string {
  if (value == null)
    return '-'
  if (typeof value === 'object')
    return JSON.stringify(value)
  return String(value)
}

function stringField(key: string): string {
  const value = selectedEntry.value?.[key]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function numberField(key: string): number {
  const value = selectedEntry.value?.[key]
  if (typeof value === 'number')
    return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function booleanField(key: string, defaultValue: boolean): boolean {
  const value = selectedEntry.value?.[key]
  return typeof value === 'boolean' ? value : defaultValue
}

function updateStringField(key: string, value: string) {
  updateSelectedEntry({ [key]: value })
}

function updateNumberField(key: string, value: number) {
  updateSelectedEntry({ [key]: Number.isFinite(value) ? value : 0 })
}

function updateBooleanField(key: string, value: boolean) {
  updateSelectedEntry({ [key]: value })
}

function setFilter(key: string, value: string) {
  if (key !== 'status')
    return
  statusFilter.value = value
  currentPage.value = 1
}

function setPage(page: number) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value)
}

function setSearch(value: string) {
  search.value = value
  currentPage.value = 1
}

function setSort(key: string) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortKey.value = key
    sortDirection.value = 'asc'
  }
  currentPage.value = 1
}
</script>

<template>
  <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
    <AdminListPanel
      :columns="columns"
      :current-page="currentPage"
      description="Admin-managed routing entries stored in configKV."
      empty-label="No router entries"
      :filters="statusFilters"
      :initial-loading="loading"
      :loading="loading"
      :page-end="pageEnd"
      :page-start="pageStart"
      :search="search"
      search-placeholder="Search route, model, or URL"
      :sort-direction="sortDirection"
      :sort-key="sortKey"
      table-class="min-w-[860px] table-fixed"
      title="LLM_ROUTER"
      :total-items="sortedEntries.length"
      :total-pages="totalPages"
      @filter="setFilter"
      @page="setPage"
      @search="setSearch"
      @sort="setSort"
    >
      <template #actions>
        <div class="flex flex-col items-end gap-2">
          <div class="flex items-center gap-2">
            <span
              class="badge whitespace-nowrap"
              :class="listDirty ? 'badge-amber' : 'badge-green'"
            >
              <span :class="listDirty ? 'i-lucide-dot' : 'i-lucide-check-circle-2'" />
              {{ saveStatusLabel }}
            </span>
            <span v-if="listDirty" class="max-w-[260px] text-right text-xs text-neutral-500">
              {{ entries.filter(isRouteDirty).length }} changed<span v-if="deletedEntries.length"> · {{ deletedEntries.length }} deleted</span>
            </span>
          </div>
          <div class="flex flex-nowrap items-center gap-2">
            <button class="btn btn-secondary min-w-[104px] whitespace-nowrap" type="button" @click="addEntry">
              <span class="i-lucide-plus" />
              Add Route
            </button>
            <button class="btn btn-primary min-w-[104px] whitespace-nowrap" :disabled="saving" type="button" @click="saveAll">
              <span class="i-lucide-save" />
              Save List
            </button>
          </div>
        </div>
      </template>

      <template #colgroup>
        <colgroup>
          <col class="w-[240px]">
          <col class="w-[180px]">
          <col class="w-[220px]">
          <col class="w-[72px]">
          <col class="w-[112px]">
          <col class="w-[56px]">
        </colgroup>
      </template>

      <template #rows>
        <tr
          v-for="(entry, index) in paginatedEntries"
          :key="String(entry.id ?? index)"
          class="cursor-pointer transition-colors hover:bg-neutral-50"
          :class="{ 'bg-emerald-50/50': selectedEntry === entry }"
          tabindex="0"
          @click="selectRoute(entry)"
          @keydown.enter.prevent="selectRoute(entry)"
          @keydown.space.prevent="selectRoute(entry)"
        >
          <td>
            <div class="truncate text-left text-neutral-900 font-medium">
              {{ labelFor(entry, index) }}
            </div>
            <div class="mt-1 truncate text-xs text-neutral-500">
              {{ valueFor(entry, 'id') }}
            </div>
            <div v-if="routeChangeLabel(entry)" class="mt-2">
              <span class="badge badge-amber whitespace-nowrap">
                {{ routeChangeLabel(entry) }}
              </span>
            </div>
          </td>
          <td class="truncate">
            {{ valueFor(entry, 'model') }}
          </td>
          <td class="truncate">
            {{ valueFor(entry, 'baseUrl') }}
          </td>
          <td class="whitespace-nowrap">
            {{ valueFor(entry, 'weight') }}
          </td>
          <td>
            <span class="badge whitespace-nowrap" :class="entry.enabled === false ? 'badge-amber' : 'badge-green'">
              <span :class="entry.enabled === false ? 'i-lucide-pause-circle' : 'i-lucide-check-circle-2'" />
              {{ entry.enabled === false ? 'Disabled' : 'Enabled' }}
            </span>
          </td>
          <td class="text-right">
            <button class="btn btn-danger w-9 px-0" type="button" @click.stop="removeEntry(index)">
              <span class="i-lucide-trash-2" />
            </button>
          </td>
        </tr>
      </template>
    </AdminListPanel>

    <aside class="panel overflow-hidden">
      <div class="border-b border-neutral-200 px-5 py-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">
              Route Settings
            </h2>
            <p class="mt-1 text-sm text-neutral-500">
              Edit common router fields. Save List writes the full list to configKV.
            </p>
          </div>
          <span v-if="selectedEntry && isRouteDirty(selectedEntry)" class="badge badge-amber">
            <span class="i-lucide-pencil" />
            {{ routeChangeLabel(selectedEntry) || 'Unsaved' }}
          </span>
        </div>
      </div>
      <div v-if="selectedEntry" class="p-5 space-y-4">
        <div class="grid gap-3">
          <label class="grid gap-1.5">
            <span class="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase">
              Name
              <span v-if="isFieldDirty('name')" class="badge badge-amber">Unsaved</span>
            </span>
            <input class="field" :value="stringField('name')" type="text" @input="updateStringField('name', ($event.target as HTMLInputElement).value)">
          </label>

          <label class="grid gap-1.5">
            <span class="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase">
              Route ID
              <span v-if="isFieldDirty('id')" class="badge badge-amber">Unsaved</span>
            </span>
            <input class="field text-xs font-mono" :value="stringField('id')" type="text" @input="updateStringField('id', ($event.target as HTMLInputElement).value)">
          </label>

          <label class="grid gap-1.5">
            <span class="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase">
              Model
              <span v-if="isFieldDirty('model')" class="badge badge-amber">Unsaved</span>
            </span>
            <input class="field text-xs font-mono" :value="stringField('model')" type="text" placeholder="openai/gpt-5-mini" @input="updateStringField('model', ($event.target as HTMLInputElement).value)">
          </label>

          <label class="grid gap-1.5">
            <span class="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase">
              Base URL
              <span v-if="isFieldDirty('baseUrl')" class="badge badge-amber">Unsaved</span>
            </span>
            <input class="field text-xs font-mono" :value="stringField('baseUrl')" type="url" placeholder="https://openrouter.ai/api/v1" @input="updateStringField('baseUrl', ($event.target as HTMLInputElement).value)">
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="grid gap-1.5">
              <span class="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase">
                Weight
                <span v-if="isFieldDirty('weight')" class="badge badge-amber">Unsaved</span>
              </span>
              <input class="field" min="0" step="0.01" :value="numberField('weight')" type="number" @input="updateNumberField('weight', ($event.target as HTMLInputElement).valueAsNumber)">
            </label>

            <label class="grid gap-1.5">
              <span class="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase">
                Status
                <span v-if="isFieldDirty('enabled')" class="badge badge-amber">Unsaved</span>
              </span>
              <select class="field" :value="String(booleanField('enabled', true))" @change="updateBooleanField('enabled', ($event.target as HTMLSelectElement).value === 'true')">
                <option value="true">
                  Enabled
                </option>
                <option value="false">
                  Disabled
                </option>
              </select>
            </label>
          </div>

          <label class="grid gap-1.5">
            <span class="flex items-center gap-2 text-xs text-neutral-500 font-semibold uppercase">
              API Key Env
              <span v-if="isFieldDirty('apiKeyEnv')" class="badge badge-amber">Unsaved</span>
            </span>
            <input class="field text-xs font-mono" :value="stringField('apiKeyEnv')" type="text" placeholder="BACKEND_LLM_API_KEY" @input="updateStringField('apiKeyEnv', ($event.target as HTMLInputElement).value)">
          </label>
        </div>

        <div v-if="selectedAdditionalFields.length > 0" class="border border-neutral-200 rounded-lg">
          <div class="border-b border-neutral-200 px-3 py-2 text-xs text-neutral-500 font-semibold uppercase">
            Additional Fields
          </div>
          <div v-for="field in selectedAdditionalFields" :key="field.key" class="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-neutral-100 px-3 py-2 text-xs last:border-b-0">
            <div class="min-w-0 flex items-center gap-2 text-neutral-500 font-mono">
              <span class="truncate">{{ field.key }}</span>
              <span v-if="isFieldDirty(field.key)" class="badge badge-amber">Unsaved</span>
            </div>
            <div class="truncate text-neutral-800 font-mono">
              {{ field.value }}
            </div>
          </div>
        </div>

        <div v-if="deletedEntries.length > 0" class="border border-amber-200 rounded-lg">
          <div class="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 font-semibold uppercase">
            Deleted Routes
          </div>
          <div v-for="entry in deletedEntries" :key="routeKey(entry)" class="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-amber-100 px-3 py-2 text-xs last:border-b-0">
            <div class="truncate text-amber-700 font-mono">
              {{ valueFor(entry, 'id') }}
            </div>
            <div class="truncate text-amber-900 font-medium">
              {{ labelFor(entry, 0) }}
            </div>
          </div>
        </div>

        <div v-if="listDirty" class="border border-emerald-200 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Route list changed. Save List writes it to configKV.
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn btn-secondary" type="button" @click="selectEntry(selectedIndex)">
            <span class="i-lucide-rotate-ccw" />
            Reset Route
          </button>
        </div>
      </div>
      <div v-else class="empty-state">
        Select or add an entry
      </div>
    </aside>
  </div>
</template>
