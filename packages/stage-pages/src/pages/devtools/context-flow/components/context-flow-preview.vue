<script setup lang="ts">
import type { FlowEntry } from '../context-flow-types'

import { useContextFlowFormatters } from '../composables/use-context-flow-formatters'

defineProps<{ entry: FlowEntry }>()

const { buildPreviewItems } = useContextFlowFormatters()
</script>

<template>
  <div :class="['mt-3', 'grid', 'gap-2']">
    <div :class="['text-[11px]', 'uppercase', 'tracking-[0.08em]', 'text-neutral-400', 'dark:text-neutral-500']">
      Preview
    </div>
    <div v-if="buildPreviewItems(entry).length" :class="['grid', 'gap-2', 'sm:grid-cols-2']">
      <div
        v-for="item in buildPreviewItems(entry)"
        :key="`${entry.id}-${item.label}`"
        :class="[
          'rounded-lg',
          'bg-white/80',
          'p-3',
          'dark:bg-neutral-900/70',
        ]"
      >
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.06em]', 'text-neutral-400', 'dark:text-neutral-500']">
          {{ item.label }}
        </div>
        <pre :class="['mt-2', 'max-h-40', 'overflow-auto', 'whitespace-pre-wrap', 'break-words', 'text-xs', 'font-mono', 'text-neutral-800', 'dark:text-neutral-100']">
{{ item.value || '-' }}
        </pre>
      </div>
    </div>
    <div v-else :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
      No preview available.
    </div>
  </div>
</template>
