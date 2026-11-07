<script setup lang="ts">
import type { TraceRecord } from '@proj-airi/trace-kit'
import type { EventLogState } from '@proj-airi/trace-kit/projections'
import type { TraceItemRef } from '@proj-airi/trace-kit/views'

import { itemOfRecord } from '@proj-airi/trace-kit/views'
import { Input } from '@proj-airi/ui'
import { formatOffset } from '@proj-airi/ui-timeline/headless'
import { useClipboard } from '@vueuse/core'
import { ContextMenuContent, ContextMenuItem, ContextMenuPortal, ContextMenuRoot, ContextMenuSeparator, ContextMenuTrigger } from 'reka-ui'
import { VList } from 'virtua/vue'
import { computed, ref, shallowRef } from 'vue'

const props = defineProps<{
  log: EventLogState
  version: number
  origin: number
  late: number
}>()

const emit = defineEmits<{
  select: [selection: TraceItemRef]
}>()

/** Height of one log row in CSS pixels. Every row has it, so the virtual list needs no measurement. */
const ROW_HEIGHT = 24

const filter = ref('')

function summary(record: TraceRecord): string {
  switch (record.type) {
    case 'span.begin':
    case 'span.complete':
    case 'instant':
      return record.name
    case 'span.end':
      return record.reason ? `${record.status} · ${record.reason}` : record.status
    case 'state':
      return record.from ? `${record.from} → ${record.value}` : record.value
    case 'log':
      return record.message
    case 'source.started':
      return `${record.runtime} · format ${record.format}`
    case 'source.lost':
      return `${record.of.source} · ${record.reason}`
    case 'clock.snapshot':
      return record.values.map(value => value.clock).join(' ↔ ')
    case 'clock.discontinuity':
      return `${record.of} · ${record.reason}`
    case 'definition':
      return `${record.kind} ${record.key}`
    case 'annotation':
      return `${record.name} = ${String(record.value ?? record.label ?? '')}`
    case 'stream.started':
    case 'stream.stopped':
      return record.streamId
    default:
      return ''
  }
}

/** Every match, newest first. The virtual list renders only the rows in view, so a long log stays fast. */
const rows = computed(() => {
  void props.version
  const needle = filter.value.trim().toLowerCase()
  const result = []
  for (let index = props.log.entries.length - 1; index >= 0; index--) {
    const entry = props.log.entries[index]!
    const record = entry.record
    const track = 'track' in record ? record.track : ''
    const text = summary(record)
    if (needle && !`${record.type} ${track} ${text} ${record.source}`.toLowerCase().includes(needle))
      continue
    result.push({ entry, track, text })
  }
  return result
})

/** The record that the context menu acts on: the row that the user opened the menu on. */
const menuRecord = shallowRef<TraceRecord>()
const { copy } = useClipboard({ legacy: true })

const menuItems = computed(() => {
  const record = menuRecord.value
  if (!record)
    return []
  const track = 'track' in record ? record.track : undefined
  const text = summary(record)
  const items: { label: string, icon: string, run: () => void, separated?: boolean }[] = []
  if (itemOfRecord(record))
    items.push({ label: 'Show in timeline', icon: 'i-mingcute:aiming-2-line', run: () => onSelect(record) })
  items.push({ label: 'Copy record as JSON', icon: 'i-mingcute:braces-line', run: () => void copy(JSON.stringify(record, null, 2)), separated: items.length > 0 })
  if (text)
    items.push({ label: 'Copy summary', icon: 'i-mingcute:copy-2-line', run: () => void copy(text) })
  if (track)
    items.push({ label: 'Copy track path', icon: 'i-mingcute:copy-2-line', run: () => void copy(track) })
  if (track)
    items.push({ label: 'Filter by this track', icon: 'i-mingcute:filter-2-line', run: () => filter.value = track, separated: true })
  items.push({ label: `Filter by ${record.type}`, icon: 'i-mingcute:filter-2-line', run: () => filter.value = record.type, separated: !track })
  return items
})

function onSelect(record: TraceRecord) {
  const selection = itemOfRecord(record)
  if (selection)
    emit('select', selection)
}
</script>

<template>
  <div :class="['flex h-full min-h-0 flex-col', 'text-xs']">
    <div :class="['shrink-0 px-3 py-2', 'border-b border-neutral-200 dark:border-neutral-800']">
      <Input v-model="filter" size="sm" placeholder="Filter by type, track, name, or source" :class="['w-full max-w-80']" />
    </div>
    <!-- One menu for the whole list. A row tells the menu which record it acts on when the user opens it there. -->
    <ContextMenuRoot :modal="false">
      <ContextMenuTrigger as-child>
        <VList :data="rows" :item-size="ROW_HEIGHT" :class="['min-h-0 flex-1']">
          <template #default="{ item: { entry, track, text } }">
            <div
              :key="entry.key"
              :class="[
                'grid cursor-pointer grid-cols-[4.5rem_6.5rem_minmax(0,14rem)_minmax(0,1fr)_minmax(0,8rem)] items-center gap-2 px-3',
                'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                entry.late ? 'text-amber-600' : '',
              ]"
              :style="{ height: `${ROW_HEIGHT}px` }"
              @click="onSelect(entry.record)"
              @contextmenu="menuRecord = entry.record"
            >
              <span :class="['tabular-nums text-neutral-500']">{{ formatOffset(entry.time - origin) }}</span>
              <span :class="['truncate font-mono']">{{ entry.record.type }}</span>
              <span :class="['truncate text-neutral-500']">{{ track }}</span>
              <span :class="['truncate']" :title="text">{{ text }}</span>
              <span :class="['truncate text-right text-neutral-400']">{{ entry.record.source }}</span>
            </div>
          </template>
        </VList>
      </ContextMenuTrigger>
      <ContextMenuPortal>
        <ContextMenuContent
          v-if="menuItems.length > 0"
          :class="[
            'z-50 min-w-48 rounded-xl border p-1 text-xs shadow-lg outline-none',
            'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100',
          ]"
        >
          <template v-for="item in menuItems" :key="item.label">
            <ContextMenuSeparator v-if="item.separated" :class="['my-1 h-px bg-neutral-200 dark:bg-neutral-700']" />
            <ContextMenuItem
              :class="[
                'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 outline-none',
                'data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-700',
              ]"
              @select="item.run"
            >
              <span :class="[item.icon, 'size-3.5 text-neutral-500']" />
              {{ item.label }}
            </ContextMenuItem>
          </template>
        </ContextMenuContent>
      </ContextMenuPortal>
    </ContextMenuRoot>
    <!-- Status bar, like the one of the timeline. -->
    <div :class="['flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5', 'border-t border-neutral-200 dark:border-neutral-800', 'text-neutral-500 tabular-nums']">
      <span>{{ log.entries.length.toLocaleString() }} records</span>
      <span v-if="filter.trim()">{{ rows.length.toLocaleString() }} matches</span>
      <span v-if="log.dropped > 0">{{ log.dropped.toLocaleString() }} dropped</span>
      <span v-if="late > 0" :class="['text-amber-600']">{{ late.toLocaleString() }} late</span>
    </div>
  </div>
</template>
