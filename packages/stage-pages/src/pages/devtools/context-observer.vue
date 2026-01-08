<script setup lang="ts">
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { TimelineRange, TimeSeriesChart } from '@proj-airi/stage-ui/components'
import { useChatContextStore } from '@proj-airi/stage-ui/stores/chat/context-store'
import { Button, FieldCheckbox, FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, ref, watch } from 'vue'

const chatContextStore = useChatContextStore()
const { activeContexts, contextHistory } = storeToRefs(chatContextStore)

const selectedSource = ref('all')
const strategyFilter = ref<'all' | ContextUpdateStrategy>('all')
const textFilter = ref('')
const onlyWithText = ref(false)
const maxHistoryEntries = ref(220)
const followLatest = ref(true)
const showMetadata = ref(false)
const rangeSelection = ref<[number, number] | null>(null)

const selectedEntryId = ref<string | null>(null)

const sourceOptions = computed(() => {
  const entries = Object.keys(activeContexts.value).sort()
  return [
    { label: 'All modules', value: 'all' },
    ...entries.map(source => ({ label: source, value: source })),
  ]
})

const strategyOptions = [
  { label: 'All strategies', value: 'all' },
  { label: 'Replace', value: ContextUpdateStrategy.ReplaceSelf },
  { label: 'Append', value: ContextUpdateStrategy.AppendSelf },
]

const baseHistory = computed(() => {
  const query = textFilter.value.trim().toLowerCase()

  return contextHistory.value
    .filter((entry) => {
      if (selectedSource.value === 'all')
        return true
      return entry.sourceKey === selectedSource.value
    })
    .filter((entry) => {
      if (strategyFilter.value === 'all')
        return true
      return entry.strategy === strategyFilter.value
    })
    .filter((entry) => {
      if (!onlyWithText.value)
        return true
      return Boolean(entry.text?.trim())
    })
    .filter((entry) => {
      if (!query)
        return true
      return [
        entry.sourceKey,
        entry.text,
        entry.id,
        entry.contextId,
      ].filter(Boolean).join(' ').toLowerCase().includes(query)
    })
    .slice(-maxHistoryEntries.value)
})

const filteredHistory = computed(() => {
  if (!rangeSelection.value)
    return baseHistory.value

  const [start, end] = rangeSelection.value
  return baseHistory.value.filter((entry) => {
    const timestamp = entry.createdAt ?? 0
    return timestamp >= start && timestamp <= end
  })
})

const rangeData = computed(() => baseHistory.value.map(entry => entry.createdAt ?? 0))

const activeContextGroups = computed(() => {
  const keys = selectedSource.value === 'all'
    ? Object.keys(activeContexts.value)
    : [selectedSource.value]

  return keys
    .sort()
    .map((key) => {
      const contexts = activeContexts.value[key] ?? []
      const latest = contexts.at(-1)?.createdAt ?? 0
      return {
        key,
        contexts,
        latest,
      }
    })
    .sort((a, b) => b.latest - a.latest)
})

const totalActiveContexts = computed(() => {
  return Object.values(activeContexts.value).reduce((sum, contexts) => sum + contexts.length, 0)
})

const updateWindowMs = 60_000
const updateBucketCount = 30
const updateBucketMs = updateWindowMs / updateBucketCount

const updateTimeline = computed(() => {
  const now = Date.now()
  const buckets = Array.from({ length: updateBucketCount }, () => 0)

  for (const entry of filteredHistory.value) {
    const ts = entry.createdAt || now
    const offset = ts - (now - updateWindowMs)
    if (offset < 0 || offset > updateWindowMs)
      continue
    const index = Math.min(updateBucketCount - 1, Math.max(0, Math.floor(offset / updateBucketMs)))
    buckets[index] += 1
  }

  const peak = Math.max(1, ...buckets)
  const normalized = buckets.map(value => value / peak)
  return {
    normalized,
    currentValue: normalized[normalized.length - 1] ?? 0,
    total: buckets.reduce((sum, value) => sum + value, 0),
  }
})

const queueEntries = computed(() => filteredHistory.value.slice(-80))

const selectedEntry = computed(() => {
  if (!selectedEntryId.value)
    return null
  return filteredHistory.value.find(entry => entry.id === selectedEntryId.value) || null
})

const activeFilterSummary = computed(() => {
  const filters = []
  if (selectedSource.value !== 'all')
    filters.push(`module:${selectedSource.value}`)
  if (strategyFilter.value !== 'all')
    filters.push(`strategy:${formatStrategy(strategyFilter.value)}`)
  if (onlyWithText.value)
    filters.push('text-only')
  if (textFilter.value.trim())
    filters.push(`query:${textFilter.value.trim()}`)
  if (rangeSelection.value) {
    const [start, end] = rangeSelection.value
    filters.push(`${new Date(start).toLocaleTimeString()} → ${new Date(end).toLocaleTimeString()}`)
  }
  return filters.length ? filters.join(' · ') : 'All updates'
})

function formatStrategy(strategy: ContextUpdateStrategy) {
  return strategy === ContextUpdateStrategy.AppendSelf ? 'Append' : 'Replace'
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString()
}

function formatRelativeTime(timestamp: number | null | undefined) {
  if (!timestamp)
    return 'Never'
  const diffMs = Date.now() - timestamp
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000))
  if (diffSeconds < 60)
    return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60)
    return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours}h ago`
}

function summarizeText(text: string, limit = 120) {
  if (!text)
    return 'No context text.'
  if (text.length <= limit)
    return text
  return `${text.slice(0, limit)}…`
}

function queueDotClass(entry: { strategy: ContextUpdateStrategy }) {
  if (entry.strategy === ContextUpdateStrategy.AppendSelf)
    return 'bg-emerald-400/80'
  return 'bg-amber-400/80'
}

function resetRange() {
  rangeSelection.value = null
}

watch(() => filteredHistory.value.length, () => {
  if (!followLatest.value)
    return
  const latest = filteredHistory.value.at(-1)
  if (latest)
    selectedEntryId.value = latest.id
})

watch([selectedSource, strategyFilter, textFilter, onlyWithText], () => {
  if (!followLatest.value)
    return
  const latest = filteredHistory.value.at(-1)
  if (latest)
    selectedEntryId.value = latest.id
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-6']">
    <div
      :class="[
        'rounded-2xl',
        'bg-gradient-to-br',
        'from-neutral-100',
        'via-white',
        'to-primary-100/50',
        'p-5',
        'shadow-sm',
        'dark:from-neutral-900/80',
        'dark:via-neutral-950',
        'dark:to-primary-900/20',
      ]"
    >
      <div :class="['flex', 'flex-col', 'gap-5', 'lg:flex-row', 'lg:items-center', 'lg:justify-between']">
        <div :class="['flex', 'flex-col', 'gap-2']">
          <div :class="['text-xs', 'uppercase', 'tracking-[0.25em]', 'text-neutral-400']">
            Context Observatory
          </div>
          <div :class="['text-2xl', 'font-semibold', 'text-neutral-800', 'dark:text-neutral-100']">
            Active contexts: {{ totalActiveContexts }}
          </div>
          <div :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ activeFilterSummary }}
          </div>
        </div>

        <div :class="['grid', 'gap-3', 'md:grid-cols-2', 'xl:grid-cols-4']">
          <FieldSelect
            v-model="selectedSource"
            label="Module"
            :options="sourceOptions"
          />
          <FieldSelect
            v-model="strategyFilter"
            label="Strategy"
            :options="strategyOptions"
          />
          <FieldInput
            v-model="textFilter"
            label="Search"
            placeholder="Find by text / id"
          />
          <FieldRange
            v-model="maxHistoryEntries"
            label="Log depth"
            :min="40"
            :max="300"
            :step="20"
            :format-value="value => `${value} entries`"
          />
        </div>
      </div>

      <div :class="['mt-4', 'grid', 'gap-4', 'md:grid-cols-3']">
        <FieldCheckbox
          v-model="onlyWithText"
          label="Text-only updates"
          description="Hide empty or metadata-only updates."
        />
        <FieldCheckbox
          v-model="followLatest"
          label="Follow latest"
          description="Auto-select newest update."
        />
        <FieldCheckbox
          v-model="showMetadata"
          label="Show metadata"
          description="Display raw metadata in details."
        />
      </div>
    </div>

    <div :class="['grid', 'gap-6', 'xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]']">
      <div :class="['flex', 'flex-col', 'gap-6']">
        <div
          :class="[
            'rounded-2xl',
            'bg-neutral-100',
            'p-4',
            'shadow-sm',
            'dark:bg-[rgba(0,0,0,0.35)]',
          ]"
        >
          <div :class="['flex', 'items-center', 'justify-between']">
            <div :class="['text-sm', 'uppercase', 'tracking-wide', 'text-neutral-400']">
              Cadence
            </div>
            <div :class="['text-xs', 'text-neutral-400']">
              {{ updateTimeline.total }} updates / min
            </div>
          </div>

          <TimeSeriesChart
            :is-active="false"
            :history="updateTimeline.normalized"
            :current-value="updateTimeline.currentValue"
            :show-header="false"
            :show-legend="false"
            :show-current-value="false"
            :show-area="true"
            :show-active-indicator="false"
            :height="96"
            unit="/min"
            :precision="0"
          />

          <div :class="['mt-4', 'flex', 'items-center', 'justify-between']">
            <div :class="['text-sm', 'uppercase', 'tracking-wide', 'text-neutral-400']">
              Timeline range
            </div>
            <Button
              size="sm"
              variant="secondary"
              :disabled="!rangeSelection"
              :label="rangeSelection ? 'Reset range' : 'Full range'"
              @click="resetRange"
            />
          </div>

          <TimelineRange
            v-model:range="rangeSelection"
            :data="rangeData"
            :height="140"
            :bins="48"
          />
        </div>

        <div
          :class="[
            'rounded-2xl',
            'bg-neutral-100',
            'p-4',
            'shadow-sm',
            'dark:bg-[rgba(0,0,0,0.35)]',
          ]"
        >
          <div :class="['flex', 'items-center', 'justify-between']">
            <div :class="['text-sm', 'uppercase', 'tracking-wide', 'text-neutral-400']">
              Active contexts
            </div>
            <div :class="['text-xs', 'text-neutral-400']">
              {{ activeContextGroups.length }} modules
            </div>
          </div>

          <div :class="['mt-3', 'grid', 'gap-3', 'lg:grid-cols-2']">
            <div
              v-for="group in activeContextGroups"
              :key="group.key"
              :class="[
                'rounded-xl',
                'border',
                'border-neutral-200',
                'bg-white',
                'p-3',
                'dark:border-neutral-800',
                'dark:bg-neutral-900',
              ]"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <div :class="['text-sm', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ group.key }}
                </div>
                <div :class="['text-xs', 'text-neutral-400']">
                  {{ group.contexts.length }} contexts · {{ formatRelativeTime(group.latest) }}
                </div>
              </div>

              <div v-if="group.contexts.length === 0" :class="['mt-2', 'text-xs', 'text-neutral-400']">
                No active contexts.
              </div>

              <div v-else :class="['mt-3', 'max-h-60', 'space-y-3', 'overflow-y-auto', 'pr-1']">
                <div
                  v-for="context in group.contexts.slice().reverse()"
                  :key="context.id"
                  :class="[
                    'rounded-lg',
                    'border',
                    'border-neutral-100',
                    'bg-neutral-50',
                    'p-3',
                    'text-sm',
                    'text-neutral-700',
                    'dark:border-neutral-800/60',
                    'dark:bg-neutral-950/60',
                    'dark:text-neutral-200',
                  ]"
                >
                  <div :class="['flex', 'items-center', 'justify-between', 'text-xs', 'text-neutral-400']">
                    <span>{{ formatStrategy(context.strategy) }}</span>
                    <span>{{ context.createdAt ? formatTimestamp(context.createdAt) : 'Unknown' }}</span>
                  </div>
                  <div :class="['mt-2', 'whitespace-pre-wrap', 'text-sm', 'text-neutral-600', 'dark:text-neutral-300']">
                    {{ context.text || 'No context text.' }}
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="activeContextGroups.length === 0"
              :class="[
                'rounded-xl',
                'border-2',
                'border-dashed',
                'border-neutral-200',
                'px-4',
                'py-10',
                'text-sm',
                'text-neutral-400',
                'dark:border-neutral-800',
              ]"
            >
              No active context modules yet.
            </div>
          </div>
        </div>
      </div>

      <div :class="['flex', 'flex-col', 'gap-6']">
        <div
          :class="[
            'rounded-2xl',
            'bg-neutral-100',
            'p-4',
            'shadow-sm',
            'dark:bg-[rgba(0,0,0,0.35)]',
          ]"
        >
          <div :class="['flex', 'items-center', 'justify-between']">
            <div :class="['text-sm', 'uppercase', 'tracking-wide', 'text-neutral-400']">
              Selected update
            </div>
            <div :class="['text-xs', 'text-neutral-400']">
              {{ selectedEntry ? formatTimestamp(selectedEntry.createdAt || Date.now()) : 'None' }}
            </div>
          </div>

          <div v-if="selectedEntry" :class="['mt-3', 'space-y-3']">
            <div :class="['flex', 'items-center', 'gap-2', 'text-xs', 'text-neutral-400']">
              <span>{{ selectedEntry.sourceKey }}</span>
              <span>·</span>
              <span>{{ formatStrategy(selectedEntry.strategy) }}</span>
              <span>·</span>
              <span>{{ selectedEntry.contextId }}</span>
            </div>
            <div :class="['whitespace-pre-wrap', 'rounded-lg', 'bg-white', 'p-3', 'text-sm', 'text-neutral-700', 'dark:bg-neutral-900', 'dark:text-neutral-200']">
              {{ selectedEntry.text || 'No context text.' }}
            </div>

            <pre
              v-if="showMetadata"
              :class="[
                'rounded-lg',
                'bg-neutral-900',
                'p-3',
                'text-xs',
                'text-neutral-100',
                'overflow-auto',
              ]"
            >
{{ JSON.stringify(selectedEntry.metadata ?? {}, null, 2) }}
            </pre>
          </div>

          <div v-else :class="['mt-3', 'text-sm', 'text-neutral-400']">
            Pick a queue dot or stream block to inspect.
          </div>
        </div>

        <div
          :class="[
            'rounded-2xl',
            'bg-neutral-100',
            'p-4',
            'shadow-sm',
            'dark:bg-[rgba(0,0,0,0.35)]',
          ]"
        >
          <div :class="['flex', 'items-center', 'justify-between']">
            <div :class="['text-sm', 'uppercase', 'tracking-wide', 'text-neutral-400']">
              Stream blocks
            </div>
            <div :class="['text-xs', 'text-neutral-400']">
              {{ queueEntries.length }} recent updates
            </div>
          </div>

          <div :class="['mt-4', 'grid', 'grid-cols-6', 'gap-2', 'sm:grid-cols-8']">
            <TooltipProvider v-for="entry in queueEntries" :key="entry.id" :delay-duration="120">
              <TooltipRoot>
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    :class="[
                      'h-9',
                      'w-9',
                      'rounded-lg',
                      'border',
                      'border-neutral-200',
                      'bg-white',
                      'transition',
                      'duration-150',
                      'dark:border-neutral-800',
                      'dark:bg-neutral-900',
                      selectedEntryId === entry.id ? 'ring-2 ring-primary-500/70' : 'hover:border-neutral-300',
                    ]"
                    @click="selectedEntryId = entry.id"
                  >
                    <span :class="['block', 'h-full', 'w-full', 'rounded-lg', queueDotClass(entry)]" />
                  </button>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent
                    :class="[
                      'rounded-md',
                      'bg-white',
                      'px-2',
                      'py-1',
                      'text-xs',
                      'text-neutral-700',
                      'shadow-md',
                      'dark:bg-neutral-900',
                      'dark:text-neutral-200',
                    ]"
                  >
                    <div>{{ entry.sourceKey }} · {{ formatStrategy(entry.strategy) }}</div>
                    <div>{{ entry.createdAt ? formatTimestamp(entry.createdAt) : 'Unknown' }}</div>
                    <div>{{ summarizeText(entry.text, 80) }}</div>
                    <TooltipArrow :class="['fill-white', 'dark:fill-neutral-900']" />
                  </TooltipContent>
                </TooltipPortal>
              </TooltipRoot>
            </TooltipProvider>
          </div>

          <div :class="['mt-4', 'flex', 'flex-col', 'gap-2']">
            <button
              v-for="entry in filteredHistory.slice().reverse().slice(0, 12)"
              :key="entry.id"
              type="button"
              :class="[
                'flex',
                'items-start',
                'justify-between',
                'gap-3',
                'rounded-xl',
                'border',
                'border-neutral-200',
                'bg-white',
                'p-3',
                'text-left',
                'transition',
                'duration-150',
                selectedEntryId === entry.id ? 'border-primary-400/70 shadow-sm' : 'hover:border-neutral-300',
                'dark:border-neutral-800',
                'dark:bg-neutral-900',
                'dark:hover:border-neutral-700',
              ]"
              @click="selectedEntryId = entry.id"
            >
              <div :class="['flex', 'flex-col', 'gap-1']">
                <div :class="['flex', 'items-center', 'gap-2']">
                  <span :class="['h-2.5', 'w-2.5', 'rounded-full', queueDotClass(entry)]" />
                  <span :class="['text-xs', 'uppercase', 'tracking-wide', 'text-neutral-400']">
                    {{ entry.sourceKey }}
                  </span>
                  <span :class="['text-xs', 'text-neutral-400']">
                    {{ formatStrategy(entry.strategy) }}
                  </span>
                </div>
                <div :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200']">
                  {{ summarizeText(entry.text, 120) }}
                </div>
              </div>

              <TooltipProvider :delay-duration="150">
                <TooltipRoot>
                  <TooltipTrigger as-child>
                    <div :class="['text-xs', 'text-neutral-400', 'cursor-help']">
                      {{ entry.createdAt ? formatTimestamp(entry.createdAt) : 'Unknown' }}
                    </div>
                  </TooltipTrigger>
                  <TooltipPortal>
                    <TooltipContent
                      :class="[
                        'rounded-md',
                        'bg-white',
                        'px-2',
                        'py-1',
                        'text-xs',
                        'text-neutral-700',
                        'shadow-md',
                        'dark:bg-neutral-900',
                        'dark:text-neutral-200',
                      ]"
                    >
                      {{ entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Unknown timestamp' }}
                      <TooltipArrow :class="['fill-white', 'dark:fill-neutral-900']" />
                    </TooltipContent>
                  </TooltipPortal>
                </TooltipRoot>
              </TooltipProvider>
            </button>

            <div
              v-if="filteredHistory.length === 0"
              :class="[
                'rounded-xl',
                'border-2',
                'border-dashed',
                'border-neutral-200',
                'px-4',
                'py-10',
                'text-center',
                'text-sm',
                'text-neutral-400',
                'dark:border-neutral-800',
              ]"
            >
              No updates yet. Emit a context update to populate the stream.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
