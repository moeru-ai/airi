<script setup lang="ts">
import type { ContextLifecycleRecord } from '@proj-airi/stage-ui/stores/devtools/context-observability'

import { Section } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'

const props = defineProps<{
  records: ContextLifecycleRecord[]
  filterText: string
}>()

const filteredRecords = computed(() => {
  const query = props.filterText.trim().toLowerCase()
  if (!query)
    return props.records

  return props.records.filter((record) => {
    const haystack = [
      record.phase,
      record.channel,
      record.sourceKey,
      record.sessionId,
      record.strategy,
      record.lane,
      record.contextId,
      record.eventId,
      record.mutation,
      record.textPreview,
      record.sourceLabel,
      (() => {
        try {
          return JSON.stringify(record.details)
        }
        catch {
          return ''
        }
      })(),
    ].filter(Boolean).join(' ').toLowerCase()

    return haystack.includes(query)
  })
})

function phaseBadgeClass(phase: ContextLifecycleRecord['phase']) {
  switch (phase) {
    case 'server-received':
      return ['bg-orange-500/15', 'text-orange-600', 'dark:text-orange-300']
    case 'broadcast-received':
    case 'broadcast-posted':
      return ['bg-violet-500/15', 'text-violet-600', 'dark:text-violet-300']
    case 'before-compose':
    case 'prompt-context-built':
    case 'after-compose':
      return ['bg-lime-500/15', 'text-lime-600', 'dark:text-lime-300']
    default:
      return ['bg-sky-500/15', 'text-sky-600', 'dark:text-sky-300']
  }
}
</script>

<template>
  <Section
    title="Context Lifecycle"
    icon="i-solar:history-bold-duotone"
    inner-class="gap-3"
    :expand="false"
  >
    <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
      {{ filteredRecords.length }} lifecycle record(s).
    </div>

    <div v-if="!filteredRecords.length" :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
      No lifecycle record matches the current filter.
    </div>

    <div v-else :class="['grid', 'gap-3']">
      <div
        v-for="record in filteredRecords"
        :key="record.id"
        :class="[
          'rounded-xl',
          'border',
          'border-neutral-200/70',
          'bg-white/80',
          'p-4',
          'dark:border-neutral-800/80',
          'dark:bg-neutral-950/60',
        ]"
      >
        <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-2']">
          <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
            <span :class="['rounded-full', 'px-2', 'py-0.5', 'text-xs', ...phaseBadgeClass(record.phase)]">
              {{ record.phase }}
            </span>
            <span :class="['rounded-full', 'bg-neutral-400/15', 'px-2', 'py-0.5', 'text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
              {{ record.channel }}
            </span>
            <span v-if="record.sourceKey" :class="['font-mono', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ record.sourceKey }}
            </span>
          </div>
          <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ new Date(record.timestamp).toLocaleTimeString() }}
          </span>
        </div>

        <div :class="['mt-2', 'grid', 'gap-1', 'text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
          <div v-if="record.textPreview">
            {{ record.textPreview }}
          </div>
          <div v-if="record.contextId">
            contextId={{ record.contextId }}
          </div>
          <div v-if="record.mutation">
            mutation={{ record.mutation }}
          </div>
          <div v-if="record.sessionId">
            session={{ record.sessionId }}
          </div>
          <div v-if="record.sourceLabel">
            source={{ record.sourceLabel }}
          </div>
        </div>

        <details :class="['mt-3']">
          <summary :class="['cursor-pointer', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            Details
          </summary>
          <pre :class="['mt-2', 'max-h-72', 'overflow-auto', 'rounded-lg', 'bg-neutral-900/90', 'p-3', 'text-xs', 'text-neutral-100']">{{ JSON.stringify(record, null, 2) }}</pre>
        </details>
      </div>
    </div>
  </Section>
</template>
