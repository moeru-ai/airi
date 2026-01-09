<script setup lang="ts">
import type { SparkNotifyEntryState } from '../context-flow-types'

import { useContextFlowFormatters } from '../composables/use-context-flow-formatters'

defineProps<{ entryId: number, state?: SparkNotifyEntryState }>()

const { buildSparkCommandPreview } = useContextFlowFormatters()
</script>

<template>
  <div
    :class="[
      'mt-3',
      'rounded-lg',
      'bg-white/80',
      'p-3',
      'text-xs',
      'dark:bg-neutral-900/70',
      'grid',
      'gap-3',
    ]"
  >
    <div v-if="state" :class="['grid', 'gap-3']">
      <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
        <div :class="['flex', 'items-center', 'gap-2', 'text-neutral-700', 'dark:text-neutral-200']">
          <span
            v-if="state.handling"
            :class="['size-3.5', 'i-svg-spinners:ring-resize', 'animate-spin']"
          />
          <span>
            {{ state.handling ? 'Handling spark:notify...' : 'spark:notify handled' }}
          </span>
        </div>
        <span
          v-if="state.endedAt"
          :class="['text-[11px]', 'text-neutral-400', 'dark:text-neutral-500']"
        >
          {{ Math.max(0, (state.endedAt ?? 0) - (state.startedAt ?? 0)) }}ms
        </span>
      </div>
      <div :class="['text-[11px]', 'text-neutral-500', 'dark:text-neutral-400']">
        eventId: {{ state.eventId }} · sparkId: {{ state.sparkId ?? '-' }}
      </div>
      <div
        v-if="state.error"
        :class="['rounded-md', 'border', 'border-rose-500/40', 'bg-rose-500/10', 'px-2', 'py-1.5', 'text-rose-600', 'dark:text-rose-300']"
      >
        {{ state.error }}
      </div>
      <div :class="['grid', 'gap-2']">
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.06em]', 'text-neutral-400', 'dark:text-neutral-500']">
          Output text
        </div>
        <pre :class="['max-h-40', 'overflow-auto', 'whitespace-pre-wrap', 'break-words', 'text-xs', 'font-mono', 'text-neutral-800', 'dark:text-neutral-100']">
{{ state.reaction || '-' }}
        </pre>
      </div>
      <div :class="['grid', 'gap-2']">
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.06em]', 'text-neutral-400', 'dark:text-neutral-500']">
          Commands
        </div>
        <div v-if="state.commands.length" :class="['grid', 'gap-2']">
          <div
            v-for="(command, index) in state.commands"
            :key="command.commandId ?? `${entryId}-${index}`"
            :class="[
              'rounded-lg',
              'border',
              'border-neutral-200/70',
              'bg-white/80',
              'p-3',
              'dark:border-neutral-800/80',
              'dark:bg-neutral-950/60',
              'grid',
              'gap-2',
            ]"
          >
            <div :class="['text-xs', 'font-semibold', 'text-neutral-700', 'dark:text-neutral-200']">
              Command {{ index + 1 }}
            </div>
            <div v-if="buildSparkCommandPreview(command).length" :class="['grid', 'gap-2', 'sm:grid-cols-2']">
              <div
                v-for="item in buildSparkCommandPreview(command)"
                :key="`${entryId}-${index}-${item.label}`"
                :class="[
                  'rounded-lg',
                  'border',
                  'border-neutral-200/70',
                  'bg-white/80',
                  'p-2.5',
                  'dark:border-neutral-800/80',
                  'dark:bg-neutral-900/70',
                ]"
              >
                <div :class="['text-[11px]', 'uppercase', 'tracking-[0.06em]', 'text-neutral-400', 'dark:text-neutral-500']">
                  {{ item.label }}
                </div>
                <pre :class="['mt-1.5', 'max-h-32', 'overflow-auto', 'whitespace-pre-wrap', 'break-words', 'text-xs', 'font-mono', 'text-neutral-800', 'dark:text-neutral-100']">
{{ item.value || '-' }}
                </pre>
              </div>
            </div>
            <div v-else :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              No command details available.
            </div>
          </div>
        </div>
        <div v-else :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          No commands returned.
        </div>
      </div>
    </div>
    <div v-else :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
      No spark:notify handling data yet.
    </div>
  </div>
</template>
