<script setup lang="ts">
import type { FlowEntry, SparkNotifyEntryState } from '../context-flow-types'

import ContextFlowPreview from './context-flow-preview.vue'
import ContextFlowSparkNotify from './context-flow-spark-notify.vue'

import { useContextFlowFormatters } from '../composables/use-context-flow-formatters'

defineProps<{ entry: FlowEntry, sparkNotifyState?: SparkNotifyEntryState }>()

const {
  channelBadgeClasses,
  directionBadgeClasses,
  directionIconClass,
  formatPayload,
  formatTimestamp,
  getEventSource,
  sourceBadgeClasses,
} = useContextFlowFormatters()
</script>

<template>
  <div
    :class="[
      'rounded-xl',
      'border',
      'border-neutral-200/70',
      'bg-neutral-50/80',
      'p-4',
      'shadow-sm',
      'dark:border-neutral-800/80',
      'dark:bg-neutral-950/60',
    ]"
  >
    <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
      <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2', 'text-xs']">
        <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'flex', 'items-center', 'justify-center', ...directionBadgeClasses(entry.direction)]">
          <span :class="['size-3.5', directionIconClass(entry.direction)]" :aria-label="entry.direction" />
        </span>
        <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', ...channelBadgeClasses(entry.channel)]">
          {{ entry.channel }}
        </span>
        <span
          v-if="getEventSource(entry)"
          :class="['rounded-full', 'border', 'px-2', 'py-0.5', ...sourceBadgeClasses()]"
        >
          {{ getEventSource(entry) }}
        </span>
        <span :class="['font-semibold', 'text-neutral-800', 'dark:text-neutral-100']">
          {{ entry.type }}
        </span>
      </div>
      <span :class="['font-mono', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
        {{ formatTimestamp(entry.timestamp) }}
      </span>
    </div>

    <div v-if="entry.summary" :class="['mt-2', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
      {{ entry.summary }}
    </div>

    <ContextFlowSparkNotify
      v-if="entry.type === 'spark:notify'"
      :entry-id="entry.id"
      :state="sparkNotifyState"
    />

    <ContextFlowPreview :entry="entry" />

    <details :class="['mt-3']">
      <summary :class="['cursor-pointer', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
        Details
      </summary>
      <pre :class="['mt-2', 'max-h-64', 'overflow-auto', 'rounded-lg', 'bg-neutral-900/90', 'p-3', 'text-xs', 'text-neutral-100']">
{{ formatPayload(entry.payload) }}
      </pre>
    </details>
  </div>
</template>
