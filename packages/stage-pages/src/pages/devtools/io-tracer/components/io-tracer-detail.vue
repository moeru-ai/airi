<script setup lang="ts">
import type { IOSpan, IOTurn } from '@proj-airi/stage-shared'

import { computed } from 'vue'

import { SUBSYSTEM_CONFIG_MAP } from '../io-tracer-types'

const props = defineProps<{
  span: IOSpan | undefined
  turn: IOTurn | undefined
}>()

defineEmits<{
  close: []
  selectSpan: [spanId: string]
}>()

function fmtMs(ms: number): string {
  if (ms < 0.01)
    return '0ms'
  if (ms < 1)
    return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000)
    return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const duration = computed(() => {
  if (!props.span?.endTs)
    return null
  return props.span.endTs - props.span.startTs
})

const relativeStart = computed(() => {
  if (!props.span || !props.turn)
    return 0
  return props.span.startTs - props.turn.startTs
})

const relativeEnd = computed(() => {
  if (!props.span?.endTs || !props.turn)
    return null
  return props.span.endTs - props.turn.startTs
})

const timingBar = computed(() => {
  if (!props.turn || !props.span)
    return null
  const turnDur = (props.turn.endTs ?? performance.now()) - props.turn.startTs
  if (turnDur <= 0)
    return null
  const start = (props.span.startTs - props.turn.startTs) / turnDur
  const end = ((props.span.endTs ?? performance.now()) - props.turn.startTs) / turnDur
  return { startPct: `${(start * 100).toFixed(1)}%`, widthPct: `${((end - start) * 100).toFixed(1)}%` }
})

const relatedSpans = computed(() => {
  if (!props.turn || !props.span)
    return []
  return props.turn.spans
    .filter(s => s.id !== props.span!.id)
    .slice(0, 10)
    .map(s => ({
      id: s.id,
      lane: s.subsystem,
      name: s.name,
      label: SUBSYSTEM_CONFIG_MAP.get(s.subsystem)?.label ?? s.subsystem,
      color: SUBSYSTEM_CONFIG_MAP.get(s.subsystem)?.color ?? '#888',
      duration: s.endTs ? fmtMs(s.endTs - s.startTs) : 'live',
    }))
})

const metaEntries = computed(() => {
  if (!props.span)
    return []
  const skip = new Set(['endTs'])
  return Object.entries(props.span.meta)
    .filter(([k]) => !skip.has(k))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
      isLong: typeof value === 'string' && value.length > 60,
    }))
})

function copyValue(value: string) {
  navigator.clipboard.writeText(value)
}
</script>

<template>
  <div
    v-if="props.span && props.turn"
    :class="[
      'w-72 flex-shrink-0',
      'border-l border-neutral-200 dark:border-neutral-700',
      'overflow-y-auto',
      'bg-white dark:bg-neutral-900',
    ]"
  >
    <!-- Header -->
    <div :class="['flex items-center justify-between', 'px-3 py-2', 'border-b border-neutral-200 dark:border-neutral-700']">
      <div :class="['flex items-center gap-2 min-w-0']">
        <div
          :class="['w-2.5 h-2.5 rounded-sm flex-shrink-0']"
          :style="{ backgroundColor: SUBSYSTEM_CONFIG_MAP.get(props.span.subsystem)?.color }"
        />
        <span :class="['text-sm font-medium truncate']">
          {{ SUBSYSTEM_CONFIG_MAP.get(props.span.subsystem)?.label }}
        </span>
        <span :class="['text-xs text-neutral-400']">{{ props.span.name }}</span>
      </div>
      <button
        :class="['text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300', 'p-1 flex-shrink-0']"
        @click="$emit('close')"
      >
        <div class="i-solar:close-circle-bold-duotone h-4 w-4" />
      </button>
    </div>

    <!-- Timing Bar Visualization -->
    <div
      v-if="timingBar"
      :class="['px-3 py-2', 'border-b border-neutral-100 dark:border-neutral-800']"
    >
      <div :class="['text-2.5 text-neutral-400 mb-1']">
        Position in turn
      </div>
      <div :class="['h-3 rounded-full bg-neutral-100 dark:bg-neutral-800 relative overflow-hidden']">
        <div
          :class="['absolute h-full rounded-full']"
          :style="{
            left: timingBar.startPct,
            width: timingBar.widthPct,
            backgroundColor: SUBSYSTEM_CONFIG_MAP.get(props.span.subsystem)?.color,
            opacity: 0.8,
          }"
        />
      </div>
    </div>

    <div :class="['px-3 py-2', 'text-xs', 'flex flex-col gap-3']">
      <!-- Timing Section -->
      <div>
        <div :class="['text-neutral-500 font-medium mb-1.5 uppercase tracking-wider text-2.5']">
          Timing
        </div>
        <div :class="['grid grid-cols-[auto_1fr] gap-x-3 gap-y-1']">
          <template v-if="duration !== null">
            <span :class="['text-neutral-400']">Duration</span>
            <span :class="['font-mono font-medium']">{{ fmtMs(duration) }}</span>
          </template>
          <template v-else>
            <span :class="['text-neutral-400']">Status</span>
            <span :class="['text-amber-500 font-medium']">In progress</span>
          </template>
          <span :class="['text-neutral-400']">Start</span>
          <span :class="['font-mono']">+{{ fmtMs(relativeStart) }}</span>
          <template v-if="relativeEnd !== null">
            <span :class="['text-neutral-400']">End</span>
            <span :class="['font-mono']">+{{ fmtMs(relativeEnd) }}</span>
          </template>
          <template v-if="props.span.meta.ttftMs">
            <span :class="['text-purple-500']">TTFT</span>
            <span :class="['font-mono text-purple-500 font-medium']">{{ fmtMs(props.span.meta.ttftMs) }}</span>
          </template>
        </div>
      </div>

      <!-- Text Content -->
      <div v-if="props.span.meta.text">
        <div :class="['text-neutral-500 font-medium mb-1.5 uppercase tracking-wider text-2.5']">
          Text
        </div>
        <div
          :class="[
            'p-2 rounded',
            'bg-neutral-50 dark:bg-neutral-800',
            'font-mono text-2.5 break-all whitespace-pre-wrap',
            'max-h-32 overflow-y-auto',
            'relative group',
          ]"
        >
          {{ props.span.meta.text }}
          <button
            :class="[
              'absolute top-1 right-1',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'p-0.5 rounded bg-neutral-200 dark:bg-neutral-700',
              'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
            ]"
            title="Copy text"
            @click="copyValue(props.span.meta.text)"
          >
            <div class="i-solar:copy-bold-duotone h-3 w-3" />
          </button>
        </div>
      </div>

      <!-- Metadata -->
      <div v-if="metaEntries.length > 0">
        <div :class="['text-neutral-500 font-medium mb-1.5 uppercase tracking-wider text-2.5']">
          Attributes
        </div>
        <div :class="['flex flex-col gap-1']">
          <div
            v-for="entry in metaEntries"
            :key="entry.key"
            :class="['grid grid-cols-[auto_1fr] gap-x-2 items-start group']"
          >
            <span :class="['text-neutral-400 text-2.5']">{{ entry.key }}</span>
            <div :class="['flex items-start gap-1']">
              <span
                :class="[
                  'font-mono text-2.5',
                  entry.isLong ? 'break-all' : 'truncate',
                ]"
              >{{ entry.value }}</span>
              <button
                :class="[
                  'opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0',
                  'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300',
                ]"
                title="Copy value"
                @click="copyValue(entry.value)"
              >
                <div class="i-solar:copy-bold-duotone h-2.5 w-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Related Spans -->
      <div v-if="relatedSpans.length > 0">
        <div :class="['text-neutral-500 font-medium mb-1.5 uppercase tracking-wider text-2.5']">
          Related spans in turn
        </div>
        <div :class="['flex flex-col gap-0.5']">
          <button
            v-for="rs in relatedSpans"
            :key="rs.id"
            :class="[
              'flex items-center gap-1.5 px-1.5 py-1 rounded text-left',
              'hover:bg-neutral-50 dark:hover:bg-neutral-800',
              'transition-colors',
            ]"
            @click="$emit('selectSpan', rs.id)"
          >
            <div
              :class="['w-1.5 h-1.5 rounded-sm flex-shrink-0']"
              :style="{ backgroundColor: rs.color }"
            />
            <span :class="['text-2.5 text-neutral-500 flex-shrink-0']">{{ rs.label }}</span>
            <span :class="['text-2.5 truncate']">{{ rs.name }}</span>
            <span :class="['text-2.5 text-neutral-400 ml-auto flex-shrink-0 font-mono']">{{ rs.duration }}</span>
          </button>
        </div>
      </div>

      <!-- Span IDs -->
      <div>
        <div :class="['text-neutral-500 font-medium mb-1.5 uppercase tracking-wider text-2.5']">
          Identity
        </div>
        <div :class="['grid grid-cols-[auto_1fr] gap-x-3 gap-y-1']">
          <span :class="['text-neutral-400 text-2.5']">Trace</span>
          <span :class="['font-mono text-2.5']">{{ props.span.traceId.slice(0, 16) }}…</span>
          <span :class="['text-neutral-400 text-2.5']">Span</span>
          <span :class="['font-mono text-2.5']">{{ props.span.id.slice(0, 16) }}</span>
          <template v-if="props.span.parentSpanId">
            <span :class="['text-neutral-400 text-2.5']">Parent</span>
            <span :class="['font-mono text-2.5']">{{ props.span.parentSpanId.slice(0, 16) }}</span>
          </template>
          <template v-if="props.span.ttsCorrelationId">
            <span :class="['text-neutral-400 text-2.5']">Segment</span>
            <span :class="['font-mono text-2.5']">{{ props.span.ttsCorrelationId.slice(0, 16) }}</span>
          </template>
        </div>
      </div>

      <!-- Turn Info -->
      <div>
        <div :class="['text-neutral-500 font-medium mb-1.5 uppercase tracking-wider text-2.5']">
          Turn
        </div>
        <div :class="['grid grid-cols-[auto_1fr] gap-x-3 gap-y-1']">
          <span :class="['text-neutral-400 text-2.5']">Spans</span>
          <span :class="['text-2.5']">{{ props.turn.spans.length }}</span>
          <template v-if="props.turn.endTs">
            <span :class="['text-neutral-400 text-2.5']">Total</span>
            <span :class="['font-mono text-2.5']">{{ fmtMs(props.turn.endTs - props.turn.startTs) }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty State -->
  <div
    v-else
    :class="[
      'w-72 flex-shrink-0',
      'border-l border-neutral-200 dark:border-neutral-700',
      'flex flex-col items-center justify-center',
      'text-neutral-400',
      'bg-white dark:bg-neutral-900',
    ]"
  >
    <div class="i-solar:cursor-bold-duotone mb-2 h-8 w-8 opacity-30" />
    <span :class="['text-xs']">Click a span to inspect</span>
  </div>
</template>
