<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  /** Names the value in the label above the ruler and for assistive technology. */
  label: string
  min: number
  max: number
  /** The smallest change. Values are rounded to it. @default 0.01 */
  step?: number
  /** The value that Reset restores. The ruler marks it with a tinted tick. */
  defaultValue: number
  /** Formats the value for the label and for `aria-valuetext`. */
  format?: (value: number) => string
}>(), {
  step: 0.01,
  format: (value: number) => String(value),
})

const value = defineModel<number>({ required: true })

const { t } = useI18n()

/**
 * The full range is drawn as a 600 px scale with 60 tick intervals. The scale moves under a fixed center line,
 * so the value under the line is the current value. Dragging moves the scale with the finger.
 */
const SCALE_WIDTH = 600
const TICK_COUNT = 60

const span = computed(() => props.max - props.min)
const ratio = computed(() => (clamp(value.value) - props.min) / span.value)
const ticks = computed(() => {
  const defaultTick = Math.round(((props.defaultValue - props.min) / span.value) * TICK_COUNT)
  return Array.from({ length: TICK_COUNT + 1 }, (_, index) => {
    const major = index % 5 === 0
    let color = major ? 'bg-neutral-400 dark:bg-neutral-500' : 'bg-neutral-300 dark:bg-neutral-600'
    if (index === defaultTick)
      color = 'bg-primary-400/60'

    return { height: major ? 'h-5.5' : 'h-3.5', color }
  })
})
const valueText = computed(() => props.format(value.value))
const changed = computed(() => value.value !== props.defaultValue)

function clamp(next: number) {
  return Math.min(props.max, Math.max(props.min, next))
}

function commit(next: number) {
  const decimals = (String(props.step).split('.')[1] ?? '').length
  value.value = Number((Math.round(clamp(next) / props.step) * props.step).toFixed(decimals))
}

/** Pointer state while a drag is active. It is cleared on release, cancel, and lost capture. */
const drag = ref<{ pointerId: number, startX: number, startValue: number }>()

function onPointerDown(event: PointerEvent) {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  drag.value = { pointerId: event.pointerId, startX: event.clientX, startValue: value.value }
}

function onPointerMove(event: PointerEvent) {
  if (drag.value?.pointerId !== event.pointerId)
    return

  // Moving the finger right pulls the scale right, which brings smaller values under the center line.
  const deltaPixels = event.clientX - drag.value.startX
  commit(drag.value.startValue - (deltaPixels / SCALE_WIDTH) * span.value)
}

function endDrag() {
  drag.value = undefined
}

function onKeydown(event: KeyboardEvent) {
  const pageStep = props.step * 10
  const next = {
    ArrowLeft: value.value - props.step,
    ArrowDown: value.value - props.step,
    ArrowRight: value.value + props.step,
    ArrowUp: value.value + props.step,
    PageDown: value.value - pageStep,
    PageUp: value.value + pageStep,
    Home: props.min,
    End: props.max,
  }[event.key]
  if (next === undefined)
    return

  event.preventDefault()
  commit(next)
}
</script>

<template>
  <div :class="['flex flex-col items-center gap-2']">
    <div :class="['grid w-full grid-cols-[1fr_auto_1fr] items-center']">
      <span />
      <bdi
        :class="[
          'text-xs font-semibold tracking-wider uppercase whitespace-nowrap',
          'text-neutral-600 dark:text-neutral-300',
        ]"
      >
        {{ label }} · {{ valueText }}
      </bdi>
      <span :class="['justify-self-end']">
        <button
          v-if="changed"
          type="button"
          :class="[
            'rounded-lg px-1.5 py-1',
            'text-xs font-medium text-primary-600 dark:text-primary-300',
            'transition-colors duration-200 hover:bg-primary-500/10',
          ]"
          @click="value = defaultValue"
        >
          {{ t('settings.pages.models.editor.reset') }}
        </button>
      </span>
    </div>

    <div
      role="slider"
      tabindex="0"
      :aria-label="label"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="value"
      :aria-valuetext="valueText"
      :class="[
        'relative h-11 w-full overflow-hidden',
        'cursor-ew-resize touch-none select-none',
        'rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
        '[mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)]',
      ]"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @keydown="onKeydown"
    >
      <div
        aria-hidden="true"
        :class="['absolute inset-y-0 left-1/2 flex items-center justify-between']"
        :style="{ width: `${SCALE_WIDTH}px`, transform: `translateX(${-ratio * SCALE_WIDTH}px)` }"
      >
        <span
          v-for="(tick, index) in ticks"
          :key="index"
          :class="['w-0.5 shrink-0 rounded-full', tick.height, tick.color]"
        />
      </div>
      <span
        aria-hidden="true"
        :class="['absolute inset-y-1.5 left-1/2 w-0.75 -translate-x-1/2 rounded-full', 'bg-primary-500']"
      />
    </div>
  </div>
</template>
