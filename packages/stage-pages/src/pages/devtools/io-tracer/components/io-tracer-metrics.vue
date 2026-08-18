<script setup lang="ts">
import type { IOSubsystem, IOTurn } from '@proj-airi/stage-shared'

import { computed } from 'vue'

import { SUBSYSTEM_CONFIG_MAP } from '../io-tracer-types'

const props = defineProps<{
  turns: IOTurn[]
}>()

interface SubsystemMetric {
  subsystem: IOSubsystem
  label: string
  color: string
  totalMs: number
  count: number
}

function fmtMs(ms: number): string {
  if (ms < 0.01)
    return '—'
  if (ms < 1)
    return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000)
    return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const metrics = computed(() => {
  if (props.turns.length === 0)
    return null

  let e2eTotal = 0
  let e2eCount = 0
  let ttftTotal = 0
  let ttftCount = 0

  const subsystemAccum = new Map<IOSubsystem, { totalMs: number, count: number }>()

  for (const turn of props.turns) {
    if (turn.endTs) {
      e2eTotal += turn.endTs - turn.startTs
      e2eCount++
    }

    for (const span of turn.spans) {
      if (span.meta.ttftMs) {
        ttftTotal += span.meta.ttftMs
        ttftCount++
      }
      if (span.endTs) {
        const acc = subsystemAccum.get(span.subsystem) ?? { totalMs: 0, count: 0 }
        acc.totalMs += span.endTs - span.startTs
        acc.count++
        subsystemAccum.set(span.subsystem, acc)
      }
    }
  }

  const subsystems: SubsystemMetric[] = []
  let maxMs = 0
  for (const [subsystem, acc] of subsystemAccum) {
    const config = SUBSYSTEM_CONFIG_MAP.get(subsystem)
    if (config) {
      const avg = acc.totalMs / acc.count
      if (avg > maxMs)
        maxMs = avg
      subsystems.push({
        subsystem,
        label: config.label,
        color: config.color,
        totalMs: avg,
        count: acc.count,
      })
    }
  }

  const bottleneckSubsystem = subsystems.reduce<SubsystemMetric | null>((max, l) => (!max || l.totalMs > max.totalMs) ? l : max, null)

  return {
    e2eAvg: e2eCount > 0 ? e2eTotal / e2eCount : null,
    ttftAvg: ttftCount > 0 ? ttftTotal / ttftCount : null,
    subsystems,
    bottleneckSubsystem: bottleneckSubsystem?.subsystem ?? null,
    turnCount: props.turns.length,
    completedTurns: e2eCount,
  }
})
</script>

<template>
  <div
    v-if="metrics"
    :class="[
      'flex items-center gap-4 px-3 py-1.5',
      'border-b border-neutral-200 dark:border-neutral-700',
      'bg-neutral-50/50 dark:bg-neutral-900/50',
      'text-xs',
      'overflow-x-auto flex-shrink-0',
    ]"
  >
    <!-- E2E Latency -->
    <div :class="['flex items-center gap-1.5']">
      <span :class="['text-neutral-400']">E2E</span>
      <span :class="['font-mono font-medium']">
        {{ metrics.e2eAvg !== null ? fmtMs(metrics.e2eAvg) : '—' }}
      </span>
    </div>

    <!-- TTFT -->
    <div
      v-if="metrics.ttftAvg !== null"
      :class="['flex items-center gap-1.5']"
    >
      <span :class="['text-purple-500']">TTFT</span>
      <span :class="['font-mono font-medium text-purple-600 dark:text-purple-400']">
        {{ fmtMs(metrics.ttftAvg) }}
      </span>
    </div>

    <div :class="['w-px h-4 bg-neutral-200 dark:bg-neutral-700']" />

    <!-- Per-Subsystem Averages -->
    <div
      v-for="ss in metrics.subsystems"
      :key="ss.subsystem"
      :class="['flex items-center gap-1']"
    >
      <div
        :class="['w-2 h-2 rounded-sm']"
        :style="{ backgroundColor: ss.color }"
      />
      <span :class="['text-neutral-400']">{{ ss.label }}</span>
      <span
        :class="[
          'font-mono',
          ss.subsystem === metrics.bottleneckSubsystem ? 'font-medium text-red-500' : '',
        ]"
      >
        {{ fmtMs(ss.totalMs) }}
      </span>
      <span
        v-if="ss.subsystem === metrics.bottleneckSubsystem"
        :class="['text-2.5 text-red-400']"
      >
        bottleneck
      </span>
    </div>
  </div>
</template>
