<script setup lang="ts">
import type { FlowEntry, SparkNotifyEntryState } from '../context-flow-types'

import { Input } from '@proj-airi/ui'
import { nextTick, ref, watch } from 'vue'

import ContextFlowEntryCard from './context-flow-entry-card.vue'

const props = defineProps<{
  entries: FlowEntry[]
  getSparkNotifyState: (entry: FlowEntry) => SparkNotifyEntryState | undefined
}>()

const filterText = defineModel<string>('filterText', { required: true })

const streamContainer = ref<HTMLDivElement>()

async function scrollToTop() {
  await nextTick()
  if (streamContainer.value)
    streamContainer.value.scrollTop = 0
}

watch(() => props.entries.length, scrollToTop)
watch(() => filterText.value, scrollToTop)
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-2']">
    <div :class="['flex']">
      <Input
        v-model="filterText"
        placeholder="Search type, source, text..."
      />
    </div>
    <div
      ref="streamContainer"
      :class="[
        'max-h-[60vh]',
        'min-h-[360px]',
        'overflow-y-auto',
        'rounded-lg',
        'bg-white/70',
        'p-3',
        'dark:bg-neutral-950/50',
      ]"
    >
      <div
        v-if="!entries.length"
        :class="['h-full', 'w-full', 'flex', 'items-center', 'justify-center', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']"
      >
        No data yet. Trigger a chat, send a context update, or enable broadcast capture.
      </div>
      <div v-else v-auto-animate :class="['grid', 'gap-3']">
        <ContextFlowEntryCard
          v-for="entry in entries"
          :key="entry.id"
          :entry="entry"
          :spark-notify-state="getSparkNotifyState(entry)"
        />
      </div>
    </div>
  </div>
</template>
