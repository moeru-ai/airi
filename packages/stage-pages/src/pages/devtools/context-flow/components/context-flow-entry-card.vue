<script setup lang="ts">
import type { FlowChannel, FlowDirection, FlowEntry, SparkNotifyEntryState } from '../context-flow-types'

import ContextFlowPreview from './context-flow-preview.vue'
import ContextFlowSparkNotify from './context-flow-spark-notify.vue'

import { useContextFlowFormatters } from '../composables/use-context-flow-formatters'

defineProps<{ entry: FlowEntry, sparkNotifyState?: SparkNotifyEntryState }>()

const {
  formatPayload,
  formatTimestamp,
  getEventSource,
} = useContextFlowFormatters()

const directionBadgeClassMap: Record<FlowDirection, string[]> = {
  incoming: [
    'bg-complementary-500/15',
    'text-complementary-600',
    'dark:text-complementary-300',
    'border-complementary-500/30',
  ],
  outgoing: [
    'bg-primary-500/15',
    'text-primary-600',
    'dark:text-primary-300',
    'border-primary-500/30',
  ],
}

const channelBadgeClassMap: Record<FlowChannel, string[]> = {
  server: ['bg-orange-500/15', 'text-orange-600', 'dark:text-orange-300', 'border-orange-500/30'],
  broadcast: ['bg-violet-500/15', 'text-violet-600', 'dark:text-violet-300', 'border-violet-500/30'],
  chat: ['bg-lime-500/15', 'text-lime-600', 'dark:text-lime-300', 'border-lime-500/30'],
  devtools: ['bg-neutral-400/15', 'text-neutral-600', 'dark:text-neutral-300', 'border-neutral-500/30'],
}

const directionIconClassMap: Record<FlowDirection, string> = {
  incoming: 'i-solar:arrow-down-linear',
  outgoing: 'i-solar:arrow-up-linear',
}

const sourceBadgeClasses = ['bg-neutral-400/15', 'text-neutral-600', 'dark:text-neutral-300', 'border-neutral-500/30']

function directionBadgeClasses(direction: FlowDirection) {
  return directionBadgeClassMap[direction]
}

function channelBadgeClasses(channel: FlowChannel) {
  return channelBadgeClassMap[channel]
}

function directionIconClass(direction: FlowDirection) {
  return directionIconClassMap[direction]
}
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
          :class="['rounded-full', 'border', 'px-2', 'py-0.5', ...sourceBadgeClasses]"
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
