<script setup lang="ts">
import type { IOTurn } from '@proj-airi/stage-shared'

import { SUBSYSTEM_CONFIGS } from '../io-tracer-types'

const props = defineProps<{
  turns: IOTurn[]
  selectedTurnId: string | null
}>()

const emit = defineEmits<{
  selectTurn: [turnId: string | null]
}>()

function formatMs(ms: number): string {
  if (ms < 1)
    return '<1ms'
  if (ms < 1000)
    return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function turnDuration(turn: IOTurn): string {
  if (!turn.endTs)
    return 'live'
  return formatMs(turn.endTs - turn.startTs)
}

function spanCountBySubsystem(turn: IOTurn): { subsystem: string, count: number, color: string }[] {
  const counts = new Map<string, number>()
  for (const span of turn.spans) {
    counts.set(span.subsystem, (counts.get(span.subsystem) ?? 0) + 1)
  }
  return SUBSYSTEM_CONFIGS
    .filter(c => counts.has(c.subsystem))
    .map(c => ({ subsystem: c.label, count: counts.get(c.subsystem)!, color: c.color }))
}

function getTtft(turn: IOTurn): number | undefined {
  for (const span of turn.spans) {
    if (span.subsystem === 'llm' && span.meta.ttftMs)
      return span.meta.ttftMs
  }
  return undefined
}
</script>

<template>
  <div
    :class="[
      'w-56 flex-shrink-0',
      'border-r border-neutral-200 dark:border-neutral-700',
      'overflow-y-auto',
      'flex flex-col',
    ]"
  >
    <div :class="['px-3 py-2', 'text-xs font-medium text-neutral-500', 'border-b border-neutral-200 dark:border-neutral-700']">
      Turns
    </div>

    <button
      v-if="props.selectedTurnId"
      :class="[
        'px-3 py-1.5 text-left text-xs',
        'border-b border-neutral-100 dark:border-neutral-800',
        'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950',
        'transition-colors',
      ]"
      @click="emit('selectTurn', null)"
    >
      Show all turns
    </button>

    <div
      v-if="turns.length === 0"
      :class="['flex-1 flex items-center justify-center', 'text-xs text-neutral-400 p-4 text-center']"
    >
      No turns recorded yet
    </div>

    <div
      v-for="turn in [...turns].reverse()"
      :key="turn.id"
      :class="[
        'px-3 py-2 cursor-pointer',
        'border-b border-neutral-100 dark:border-neutral-800',
        'transition-colors',
        turn.id === props.selectedTurnId
          ? 'bg-blue-50 dark:bg-blue-950/50'
          : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
      ]"
      @click="emit('selectTurn', turn.id === props.selectedTurnId ? null : turn.id)"
    >
      <div :class="['flex items-center justify-between mb-1']">
        <span :class="['text-xs font-mono font-medium']">
          #{{ turn.id.slice(0, 6) }}
        </span>
        <span
          :class="[
            'text-2.5 font-mono px-1 py-0.5 rounded',
            turn.endTs
              ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
          ]"
        >
          {{ turnDuration(turn) }}
        </span>
      </div>

      <div
        v-if="turn.inputText"
        :class="['text-2.5 text-neutral-500 truncate mb-1']"
      >
        {{ turn.inputText.slice(0, 50) }}{{ turn.inputText.length > 50 ? '...' : '' }}
      </div>

      <div
        v-if="getTtft(turn)"
        :class="['text-2.5 text-purple-500 mb-1']"
      >
        TTFT: {{ formatMs(getTtft(turn)!) }}
      </div>

      <div :class="['flex flex-wrap gap-1']">
        <span
          v-for="item in spanCountBySubsystem(turn)"
          :key="item.subsystem"
          :class="['text-2.5 px-1 py-0.5 rounded']"
          :style="{ backgroundColor: `${item.color}15`, color: item.color }"
        >
          {{ item.subsystem }} {{ item.count }}
        </span>
      </div>
    </div>
  </div>
</template>
