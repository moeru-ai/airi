<script setup lang="ts">
import type { D3DragEvent } from 'd3'

import type {
  Live2DMotionEditableTrackId,
  Live2DMotionKeyframe,
  Live2DMotionOverlay,
  Live2DMotionOverlayBlendMode,
  Live2DMotionProject,
} from '../../composables/live2d-motion-keyframes'

import { BasicButton, Range, Select } from '@proj-airi/ui'
import { curveMonotoneX, drag, line, pointer, scaleLinear, select } from 'd3'
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  getLive2DMotionCompositePoints,
  getLive2DMotionSourcePoints,
  getLive2DMotionTrackRange,
} from '../../composables/live2d-motion-keyframes'

const props = defineProps<{
  project: Live2DMotionProject
  trackId: Live2DMotionEditableTrackId
  label: string
  active: boolean
  selectedOverlayId?: string
  playheadMs: number
  viewport: readonly [number, number]
  disabled?: boolean
}>()
const emit = defineEmits<{
  activate: []
  addOverlay: [blendMode: Live2DMotionOverlayBlendMode]
  selectOverlay: [overlayId: string]
  removeOverlay: [overlayId: string]
  updateOverlay: [overlayId: string, patch: Partial<Live2DMotionOverlay>, commit: boolean]
  addPoint: [overlayId: string, point: Live2DMotionKeyframe]
  movePoint: [overlayId: string, pointId: string, atMs: number, value: number, commit: boolean]
  removePoint: [overlayId: string, pointId: string]
  scrub: [atMs: number]
}>()
const { t } = useI18n()

const graph = useTemplateRef<SVGSVGElement>('graph')
const width = 1000
const graphHeight = computed(() => props.active ? 220 : 62)
const xScale = computed(() => scaleLinear().domain(props.viewport).range([0, width]))
const yScale = computed(() => scaleLinear().domain(getLive2DMotionTrackRange(props.trackId)).range([graphHeight.value - 12, 12]))
const sourcePoints = computed(() => getLive2DMotionSourcePoints(props.project, props.trackId))
const compositePoints = computed(() => getLive2DMotionCompositePoints(props.project, props.trackId))
const overlays = computed(() => props.project.overlays.filter(overlay => overlay.trackId === props.trackId))
const selectedOverlay = computed(() => overlays.value.find(overlay => overlay.id === props.selectedOverlayId))
const zeroY = computed(() => yScale.value(0))
const playheadX = computed(() => xScale.value(props.playheadMs))
const blendOptions = [
  { label: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.add'), value: 'add' as const },
  { label: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.replace'), value: 'replace' as const },
]
const overlayColors = ['#0ea5e9', '#f59e0b', '#a855f7', '#10b981', '#f43f5e']

function colorForOverlay(overlayId: string) {
  const index = props.project.overlays.findIndex(overlay => overlay.id === overlayId)
  return overlayColors[Math.max(0, index) % overlayColors.length]
}

function pathFor(points: readonly Live2DMotionKeyframe[]) {
  return line<Live2DMotionKeyframe>()
    .x(point => xScale.value(point.atMs))
    .y(point => yScale.value(point.value))
    .curve(curveMonotoneX)(points) ?? ''
}

function clientToPoint(event: PointerEvent | MouseEvent) {
  const [x, y] = pointer(event, graph.value)
  const [minimum, maximum] = getLive2DMotionTrackRange(props.trackId)
  return {
    atMs: Math.round(Math.min(props.viewport[1], Math.max(props.viewport[0], xScale.value.invert(x)))),
    value: Math.min(maximum, Math.max(minimum, yScale.value.invert(y))),
  }
}

function addPoint(event: MouseEvent) {
  if (!props.active || props.disabled || !selectedOverlay.value || event.target !== graph.value)
    return
  const point = clientToPoint(event)
  if (point.atMs < selectedOverlay.value.startMs || point.atMs > selectedOverlay.value.endMs)
    return
  emit('addPoint', selectedOverlay.value.id, { id: crypto.randomUUID(), ...point })
}

function scrub(event: PointerEvent) {
  if (props.disabled || event.button !== 0 || event.target !== graph.value)
    return
  emit('scrub', clientToPoint(event).atMs)
}

function updateWeight(value: number) {
  if (selectedOverlay.value)
    emit('updateOverlay', selectedOverlay.value.id, { weight: value }, true)
}

function updateBlendMode(value: Live2DMotionOverlayBlendMode | undefined) {
  if (selectedOverlay.value && value)
    emit('updateOverlay', selectedOverlay.value.id, { blendMode: value }, true)
}

function installDragBehaviors() {
  if (!graph.value)
    return

  select(graph.value).selectAll<SVGCircleElement, unknown>('.motion-overlay-point').call(
    drag<SVGCircleElement, unknown>()
      .on('drag', function (event: D3DragEvent<SVGCircleElement, unknown, unknown>) {
        const target = this
        const overlay = props.project.overlays.find(item => item.id === target.dataset.overlayId)
        if (!overlay)
          return
        const next = clientToPoint(event.sourceEvent)
        emit(
          'movePoint',
          overlay.id,
          target.dataset.pointId!,
          Math.min(overlay.endMs, Math.max(overlay.startMs, next.atMs)),
          next.value,
          false,
        )
      })
      .on('end', function () {
        const target = this
        const overlay = props.project.overlays.find(item => item.id === target.dataset.overlayId)
        const point = overlay?.points.find(item => item.id === target.dataset.pointId)
        if (overlay && point)
          emit('movePoint', overlay.id, point.id, point.atMs, point.value, true)
      }),
  )

  select(graph.value).selectAll<SVGRectElement, unknown>('.motion-overlay-handle').call(
    drag<SVGRectElement, unknown>()
      .on('drag', function (event: D3DragEvent<SVGRectElement, unknown, unknown>) {
        const target = this
        const overlay = props.project.overlays.find(item => item.id === target.dataset.overlayId)
        if (!overlay)
          return
        const next = clientToPoint(event.sourceEvent).atMs
        const patch = target.dataset.edge === 'start'
          ? { startMs: Math.min(overlay.endMs - 1, next) }
          : { endMs: Math.max(overlay.startMs + 1, next) }
        emit('updateOverlay', overlay.id, patch, false)
      })
      .on('end', function () {
        const overlayId = this.dataset.overlayId
        const overlay = props.project.overlays.find(item => item.id === overlayId)
        if (overlay)
          emit('updateOverlay', overlay.id, {}, true)
      }),
  )
}

watch(
  () => [props.active, props.selectedOverlayId, selectedOverlay.value?.points, selectedOverlay.value?.startMs, selectedOverlay.value?.endMs],
  () => nextTick(installDragBehaviors),
  { deep: true },
)
onMounted(installDragBehaviors)
</script>

<template>
  <article
    :class="[
      'overflow-hidden rounded-lg border transition-colors',
      active
        ? 'border-primary-400/70 bg-primary-50/30 dark:border-primary-600/70 dark:bg-primary-950/10'
        : 'border-neutral-200/80 bg-neutral-50/60 dark:border-neutral-800/80 dark:bg-neutral-950/30',
    ]"
    @click="emit('activate')"
  >
    <header :class="['flex min-h-12 flex-wrap items-center gap-2 px-3 py-2']">
      <button :class="['min-w-24 text-left text-sm font-semibold text-neutral-800 dark:text-neutral-100']" @click="emit('activate')">
        {{ label }}
      </button>

      <button
        v-for="overlay in overlays"
        :key="overlay.id"
        :class="[
          'rounded-full border px-2 py-1 text-xs font-medium',
          overlay.id === selectedOverlayId ? 'bg-white shadow-sm dark:bg-neutral-800' : 'opacity-70',
        ]"
        :style="{ borderColor: colorForOverlay(overlay.id), color: colorForOverlay(overlay.id) }"
        @click.stop="emit('selectOverlay', overlay.id)"
      >
        {{ overlay.name }} · {{ overlay.blendMode }}
      </button>

      <div v-if="active" :class="['ml-auto flex items-center gap-1']">
        <BasicButton size="sm" :disabled="disabled" @click.stop="emit('addOverlay', 'add')">
          <span :class="['i-solar:add-circle-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.add') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="disabled" @click.stop="emit('addOverlay', 'replace')">
          <span :class="['i-solar:add-circle-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.replace') }}
        </BasicButton>
      </div>

      <div v-if="active && selectedOverlay" :class="['basis-full flex flex-wrap items-center gap-3 border-t border-neutral-200/70 pt-2 dark:border-neutral-800/70']" @click.stop>
        <Select
          :model-value="selectedOverlay.blendMode"
          :options="blendOptions"
          :disabled="disabled"
          :class="['w-28!']"
          @update:model-value="updateBlendMode"
        />
        <label :class="['flex min-w-44 flex-1 items-center gap-2 text-xs text-neutral-500']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.weight') }} {{ selectedOverlay.weight.toFixed(2) }}
          <Range
            :model-value="selectedOverlay.weight"
            :min="0"
            :max="1"
            :step="0.05"
            :disabled="disabled"
            @update:model-value="updateWeight"
          />
        </label>
        <span :class="['font-mono text-xs text-neutral-500']">
          {{ (selectedOverlay.startMs / 1000).toFixed(2) }}s–{{ (selectedOverlay.endMs / 1000).toFixed(2) }}s
        </span>
        <BasicButton size="sm" :disabled="disabled" @click="emit('removeOverlay', selectedOverlay.id)">
          <span :class="['i-solar:trash-bin-trash-linear']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.remove') }}
        </BasicButton>
      </div>
    </header>

    <svg
      ref="graph"
      :viewBox="`0 0 1000 ${graphHeight}`"
      preserveAspectRatio="none"
      :class="[
        'w-full touch-none select-none border-t border-neutral-200/70 bg-white dark:border-neutral-800/70 dark:bg-neutral-950',
        active ? 'h-56 cursor-crosshair' : 'h-16 cursor-pointer',
      ]"
      @pointerdown="scrub"
      @dblclick="addPoint"
    >
      <line x1="0" :y1="zeroY" x2="1000" :y2="zeroY" :class="['stroke-neutral-200 dark:stroke-neutral-800']" />
      <path :d="pathFor(sourcePoints)" fill="none" :class="['stroke-neutral-400 dark:stroke-neutral-600']" stroke-width="2" vector-effect="non-scaling-stroke" />
      <path :d="pathFor(compositePoints)" fill="none" :class="['stroke-neutral-900 dark:stroke-neutral-100']" stroke-width="2" vector-effect="non-scaling-stroke" />

      <g v-for="overlay in overlays" :key="overlay.id">
        <path
          :d="pathFor(overlay.points)"
          fill="none"
          :stroke="colorForOverlay(overlay.id)"
          :stroke-width="overlay.id === selectedOverlayId ? 4 : 2"
          vector-effect="non-scaling-stroke"
          :class="['cursor-pointer']"
          @click.stop="emit('selectOverlay', overlay.id)"
        />
      </g>

      <g v-if="active && selectedOverlay">
        <rect
          class="motion-overlay-handle cursor-ew-resize"
          :data-overlay-id="selectedOverlay.id"
          data-edge="start"
          :x="xScale(selectedOverlay.startMs) - 6"
          y="0"
          width="12"
          :height="graphHeight"
          :fill="colorForOverlay(selectedOverlay.id)"
          opacity="0.22"
        />
        <rect
          class="motion-overlay-handle cursor-ew-resize"
          :data-overlay-id="selectedOverlay.id"
          data-edge="end"
          :x="xScale(selectedOverlay.endMs) - 6"
          y="0"
          width="12"
          :height="graphHeight"
          :fill="colorForOverlay(selectedOverlay.id)"
          opacity="0.22"
        />
        <circle
          v-for="point in selectedOverlay.points"
          :key="point.id"
          class="motion-overlay-point cursor-grab active:cursor-grabbing"
          :data-overlay-id="selectedOverlay.id"
          :data-point-id="point.id"
          :cx="xScale(point.atMs)"
          :cy="yScale(point.value)"
          r="7"
          :fill="colorForOverlay(selectedOverlay.id)"
          stroke="white"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          @dblclick.stop="emit('removePoint', selectedOverlay.id, point.id)"
        />
      </g>

      <line :x1="playheadX" y1="0" :x2="playheadX" :y2="graphHeight" :class="['stroke-amber-500']" stroke-width="2" vector-effect="non-scaling-stroke" />
    </svg>
  </article>
</template>
