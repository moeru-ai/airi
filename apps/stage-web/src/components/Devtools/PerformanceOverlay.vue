<script setup lang="ts">
import type { LagMetric } from '../../stores/devtools-lag'

import { Button, IconButton } from '@proj-airi/ui'
import { useDraggable, useElementBounding } from '@vueuse/core'
import { clamp } from 'es-toolkit/math'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useDevtoolsLagStore } from '../../stores/devtools-lag'

const { n, t } = useI18n()
const store = useDevtoolsLagStore()
const { enabled, buffers, lastRecording, recording, recordingElapsedMs, supported } = storeToRefs(store)

const dragBoundary = useTemplateRef<HTMLElement>('dragBoundary')
const overlay = useTemplateRef<HTMLElement>('overlay')
const dragHandle = useTemplateRef<HTMLElement>('dragHandle')
const positionInitialized = shallowRef(false)

const metrics: Array<{ key: LagMetric, labelKey: string }> = [
  {
    key: 'fps',
    labelKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.fps.label',
  },
  {
    key: 'frameDuration',
    labelKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.frame-duration.label',
  },
  {
    key: 'longtask',
    labelKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.long-task.label',
  },
  {
    key: 'memory',
    labelKey: 'tamagotchi.settings.devtools.pages.performance-visualizer.metrics.memory.label',
  },
]

const visibleMetrics = computed(() => metrics.filter(metric => (
  enabled.value[metric.key] && supported.value[metric.key]
)))
const hasAnyEnabled = computed(() => visibleMetrics.value.length > 0)
const metricStatsMap = computed<Record<LagMetric, ReturnType<typeof store.calcStats>>>(() => {
  const result = {} as Record<LagMetric, ReturnType<typeof store.calcStats>>
  for (const metric of metrics) {
    const values = buffers.value[metric.key].map(sample => sample.value)
    result[metric.key] = store.calcStats(values)
  }
  return result
})
const metricsWithStats = computed(() => visibleMetrics.value.map(metric => ({
  ...metric,
  hasSamples: buffers.value[metric.key].length > 0,
  stats: metricStatsMap.value[metric.key],
})))
const recordingElapsedSeconds = computed(() => Math.min(60, Math.floor(recordingElapsedMs.value / 1000)))
const recordingButtonLabel = computed(() => recording.value
  ? t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.stop')
  : t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.record'))

const { width: boundaryWidth, height: boundaryHeight } = useElementBounding(dragBoundary)
const { width: overlayWidth, height: overlayHeight } = useElementBounding(overlay)
const { position, isDragging } = useDraggable(overlay, {
  containerElement: dragBoundary,
  handle: dragHandle,
  preventDefault: true,
  restrictInView: true,
  onEnd() {
    positionInitialized.value = true
    clampPosition()
  },
})

const overlayPosition = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}))

watch(
  [hasAnyEnabled, boundaryWidth, boundaryHeight, overlayWidth, overlayHeight],
  ([visible, availableWidth, availableHeight, currentWidth, currentHeight]) => {
    if (!visible || availableWidth <= 0 || availableHeight <= 0 || currentWidth <= 0 || currentHeight <= 0)
      return

    if (!positionInitialized.value) {
      resetPosition()
      return
    }

    clampPosition()
  },
  { flush: 'post' },
)

function formatValue(metric: LagMetric, value: number) {
  if (!Number.isFinite(value))
    return '--'

  if (metric === 'memory') {
    return n(value / 1048576, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  }

  if (metric === 'fps')
    return n(value, { maximumFractionDigits: 0 })

  return n(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function barSeries(metric: LagMetric) {
  const values = buffers.value[metric].map(sample => sample.value)
  const histogram = store.buildHistogram(values, 20)
  const max = Math.max(1, ...histogram.map(bin => bin.count))
  return histogram.map(bin => ({
    width: `${100 / (histogram.length || 1)}%`,
    height: `${(bin.count / max) * 100}%`,
  }))
}

function clampPosition(nextX = position.value.x, nextY = position.value.y) {
  const maxX = Math.max(0, boundaryWidth.value - overlayWidth.value)
  const maxY = Math.max(0, boundaryHeight.value - overlayHeight.value)

  position.value = {
    x: clamp(nextX, 0, maxX),
    y: clamp(nextY, 0, maxY),
  }
}

function resetPosition() {
  clampPosition(0, boundaryHeight.value - overlayHeight.value)
  positionInitialized.value = true
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="hasAnyEnabled"
      ref="dragBoundary"
      :style="{
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        left: 'calc(env(safe-area-inset-left, 0px) + 0.75rem)',
      }"
      :class="['pointer-events-none fixed z-[900]']"
    >
      <section
        ref="overlay"
        data-testid="performance-overlay"
        :style="overlayPosition"
        :class="[
          'pointer-events-auto absolute w-72 max-h-full max-w-full overflow-y-auto rounded-xl p-3',
          'flex flex-col gap-2',
          'bg-neutral-950/92 text-sm text-white shadow-xl backdrop-blur-lg',
          'transition-opacity duration-150 ease-out motion-reduce:transition-none',
          positionInitialized ? 'opacity-100' : 'opacity-0',
          isDragging ? 'select-none' : '',
        ]"
      >
        <header :class="['flex items-center gap-2']">
          <div
            ref="dragHandle"
            :class="[
              'shrink-0 touch-none select-none',
              isDragging ? 'cursor-grabbing' : 'cursor-grab',
            ]"
          >
            <IconButton
              icon="i-solar:menu-dots-bold-duotone"
              :aria-label="t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.move')"
              :title="t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.move')"
            />
          </div>
          <div :class="['min-w-0 flex-1 truncate text-xs font-medium text-neutral-200 uppercase tracking-wide']">
            {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.title') }}
          </div>
          <IconButton
            icon="i-solar:restart-bold-duotone"
            :aria-label="t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.reset-position')"
            :title="t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.reset-position')"
            @click="resetPosition"
          />
        </header>

        <div
          v-for="metric in metricsWithStats"
          :key="metric.key"
          :class="['flex flex-col gap-1']"
        >
          <div :class="['flex items-center justify-between gap-3']">
            <span :class="['min-w-0 truncate text-xs text-neutral-100']">
              {{ t(metric.labelKey) }}
            </span>
            <span :class="['shrink-0 font-mono text-xs text-neutral-300 tabular-nums']">
              <template v-if="metric.hasSamples">
                {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.average') }}
                {{ formatValue(metric.key, metric.stats.avg) }}
                /
                p95 {{ formatValue(metric.key, metric.stats.p95) }}
              </template>
              <template v-else>
                --
              </template>
            </span>
          </div>
          <div
            :class="['h-10 overflow-hidden rounded bg-white/5 px-1 py-1', 'flex items-end gap-0.5']"
            aria-hidden="true"
          >
            <div
              v-for="(bar, index) in barSeries(metric.key)"
              :key="index"
              :style="{ width: bar.width, height: bar.height }"
              :class="['bg-white/50']"
            />
          </div>
        </div>

        <footer :class="['flex items-center gap-2 pt-2']">
          <Button
            size="sm"
            :icon="recording ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:record-circle-bold-duotone'"
            :label="recordingButtonLabel"
            :color="recording ? 'red' : 'neutral'"
            :outline="false"
            @click="store.toggleRecording"
          />
          <span
            v-if="recording"
            :class="['font-mono text-xs text-neutral-300 tabular-nums']"
            aria-hidden="true"
          >
            {{ n(recordingElapsedSeconds) }}s / 60s
          </span>
          <span v-else :class="['flex-1']" />
          <IconButton
            icon="i-solar:export-bold-duotone"
            :disabled="!lastRecording"
            :aria-label="t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.export')"
            :title="t('tamagotchi.settings.devtools.pages.performance-visualizer.overlay.export')"
            @click="store.exportCsv()"
          />
        </footer>
      </section>
    </div>
  </Teleport>
</template>
