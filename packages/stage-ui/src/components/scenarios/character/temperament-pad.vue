<script setup lang="ts">
import type { Temperament } from '@proj-airi/core-agent'

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  disabled?: boolean
}>()

const modelValue = defineModel<Temperament>({ required: true })

const { t } = useI18n()
const pad = ref<HTMLElement>()
const dragging = ref(false)

/** Keyboard step for one arrow key press. */
const STEP = 0.05

// The point stays inside the unit circle, where the distance means how emotional the persona is.
function setPoint(valence: number, arousal: number) {
  const distance = Math.hypot(valence, arousal)
  const scale = distance > 1 ? 1 / distance : 1
  modelValue.value = { valence: Math.round(valence * scale * 100) / 100, arousal: Math.round(arousal * scale * 100) / 100 }
}

function pointFromEvent(event: PointerEvent) {
  const rect = pad.value?.getBoundingClientRect()
  if (!rect)
    return
  setPoint(((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2)
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled)
    return
  dragging.value = true
  pad.value?.setPointerCapture(event.pointerId)
  pointFromEvent(event)
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value)
    pointFromEvent(event)
}

function onPointerUp(event: PointerEvent) {
  dragging.value = false
  pad.value?.releasePointerCapture(event.pointerId)
}

function onKeydown(event: KeyboardEvent) {
  if (props.disabled)
    return
  const moves: Record<string, [number, number]> = { ArrowRight: [STEP, 0], ArrowLeft: [-STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] }
  const move = moves[event.key]
  if (!move)
    return
  event.preventDefault()
  setPoint(modelValue.value.valence + move[0], modelValue.value.arousal + move[1])
}

const emotionality = computed(() => Math.min(Math.hypot(modelValue.value.valence, modelValue.value.arousal), 1))
const leaning = computed(() => {
  const { valence, arousal } = modelValue.value
  if (emotionality.value < 0.1)
    return t('settings.pages.card.temperament.balanced')
  if (arousal >= 0)
    return valence >= 0 ? t('settings.pages.card.temperament.joy') : t('settings.pages.card.temperament.anger')
  return valence >= 0 ? t('settings.pages.card.temperament.contentment') : t('settings.pages.card.temperament.sorrow')
})
const summary = computed(() => t('settings.pages.card.temperament.summary', { leaning: leaning.value, emotional: Math.round(emotionality.value * 100) }))
const dotStyle = computed(() => ({
  left: `${(modelValue.value.valence + 1) * 50}%`,
  top: `${(1 - modelValue.value.arousal) * 50}%`,
}))
</script>

<template>
  <div :class="['flex flex-col', 'gap-2']">
    <div
      ref="pad"
      role="slider"
      tabindex="0"
      :aria-label="t('settings.pages.card.temperament.label')"
      :aria-valuetext="summary"
      :aria-disabled="props.disabled"
      :class="[
        'relative', 'aspect-square', 'w-full max-w-72',
        'rounded-xl', 'bg-neutral-100 dark:bg-neutral-900',
        'select-none touch-none',
        'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
        props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair',
      ]"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <!-- The circle marks the most emotional edge. The center is the most rational. -->
      <div :class="['absolute inset-0', 'rounded-full', 'border border-dashed border-neutral-300 dark:border-neutral-700']" />
      <div :class="['absolute left-1/2 top-0 bottom-0', 'w-px', 'bg-neutral-300 dark:bg-neutral-700']" />
      <div :class="['absolute top-1/2 left-0 right-0', 'h-px', 'bg-neutral-300 dark:bg-neutral-700']" />
      <span :class="['absolute left-2 top-2', 'text-sm font-medium', 'text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.card.temperament.anger') }}</span>
      <span :class="['absolute right-2 top-2', 'text-sm font-medium', 'text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.card.temperament.joy') }}</span>
      <span :class="['absolute left-2 bottom-2', 'text-sm font-medium', 'text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.card.temperament.sorrow') }}</span>
      <span :class="['absolute right-2 bottom-2', 'text-sm font-medium', 'text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.card.temperament.contentment') }}</span>
      <span :class="['absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-1', 'text-xs', 'text-neutral-400 dark:text-neutral-500']">{{ t('settings.pages.card.temperament.rational') }}</span>
      <div
        :class="[
          'absolute', 'size-4', '-translate-x-1/2 -translate-y-1/2',
          'rounded-full', 'bg-primary-500 dark:bg-primary-400',
          'ring-4 ring-primary-500/20 dark:ring-primary-400/20',
          dragging ? '' : 'transition-all duration-150',
        ]"
        :style="dotStyle"
      />
    </div>
    <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
      {{ summary }}
    </p>
  </div>
</template>
