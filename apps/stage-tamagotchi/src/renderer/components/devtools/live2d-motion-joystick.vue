<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { BasicButton } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  pose: Live2DMotionControlPose
  active: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  move: [pose: Live2DMotionControlPose]
  release: []
}>()

const { t } = useI18n()
const inputActive = shallowRef(false)
const pressedKeys = new Set<string>()
const movementKeys = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'a',
  'd',
  's',
  'w',
])

const knobStyle = computed(() => ({
  transform: `translate(calc(-50% + ${props.pose.x * 5.75}rem), calc(-50% - ${props.pose.y * 5.75}rem))`,
}))

const parameterGroups = computed(() => [
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.eyes'),
    x: props.pose.x,
    y: props.pose.y,
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.head'),
    x: props.pose.x * 30,
    y: props.pose.y * 30,
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.body'),
    x: props.pose.x * 10,
    y: props.pose.y * 10,
  },
])

function setPosition(pose: Live2DMotionControlPose) {
  const magnitude = Math.hypot(pose.x, pose.y)
  const scale = magnitude > 1 ? 1 / magnitude : 1
  inputActive.value = true
  emit('move', { x: pose.x * scale, y: pose.y * scale })
}

function setPositionFromPointer(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  const bounds = target.getBoundingClientRect()
  const radius = Math.min(bounds.width, bounds.height) / 2
  setPosition({
    x: (event.clientX - (bounds.left + bounds.width / 2)) / radius,
    y: ((bounds.top + bounds.height / 2) - event.clientY) / radius,
  })
}

function release() {
  if (!inputActive.value)
    return

  pressedKeys.clear()
  inputActive.value = false
  emit('release')
}

function handlePointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0)
    return

  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  pressedKeys.clear()
  setPositionFromPointer(event)
}

function handlePointerMove(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  if (!target.hasPointerCapture(event.pointerId))
    return

  setPositionFromPointer(event)
}

function handlePointerEnd(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId))
    target.releasePointerCapture(event.pointerId)
  release()
}

function keyboardPosition(): Live2DMotionControlPose {
  const left = pressedKeys.has('ArrowLeft') || pressedKeys.has('a')
  const right = pressedKeys.has('ArrowRight') || pressedKeys.has('d')
  const down = pressedKeys.has('ArrowDown') || pressedKeys.has('s')
  const up = pressedKeys.has('ArrowUp') || pressedKeys.has('w')
  return {
    x: Number(right) - Number(left),
    y: Number(up) - Number(down),
  }
}

function handleKeyDown(event: KeyboardEvent) {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (!movementKeys.has(key))
    return

  event.preventDefault()
  pressedKeys.add(key)
  setPosition(keyboardPosition())
}

function handleKeyUp(event: KeyboardEvent) {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (!movementKeys.has(key))
    return

  event.preventDefault()
  pressedKeys.delete(key)
  if (pressedKeys.size === 0) {
    release()
    return
  }

  setPosition(keyboardPosition())
}
</script>

<template>
  <div :class="['grid gap-6', 'lg:grid-cols-[minmax(16rem,22rem)_1fr]']">
    <div :class="['flex flex-col items-center gap-4']">
      <BasicButton
        type="button"
        size="unset"
        :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.joystick-label')"
        :aria-pressed="props.active"
        :disabled="props.disabled"
        :class="[
          'relative size-64 touch-none select-none overflow-hidden rounded-full',
          'border border-neutral-300/80 dark:border-neutral-700/80',
          'bg-neutral-100/70 dark:bg-neutral-900/70',
          'shadow-inner active:scale-100!',
          'focus-visible:outline-2 focus-visible:outline-primary-400 focus-visible:outline-offset-4',
        ]"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerEnd"
        @pointercancel="handlePointerEnd"
        @keydown="handleKeyDown"
        @keyup="handleKeyUp"
        @blur="release"
        @contextmenu.prevent
      >
        <span :class="['pointer-events-none absolute inset-6 rounded-full', 'border border-neutral-300/60 dark:border-neutral-700/60']" />
        <span :class="['pointer-events-none absolute inset-x-4 top-1/2 h-px', 'bg-neutral-300/80 dark:bg-neutral-700/80']" />
        <span :class="['pointer-events-none absolute inset-y-4 left-1/2 w-px', 'bg-neutral-300/80 dark:bg-neutral-700/80']" />
        <span
          :style="knobStyle"
          :class="[
            'pointer-events-none absolute left-1/2 top-1/2 size-16 rounded-full',
            'border border-primary-300/70 bg-primary-400/90 dark:border-primary-500/70 dark:bg-primary-500/85',
            'shadow-lg shadow-primary-500/20',
            'transition-transform duration-75 ease-out',
          ]"
        >
          <span :class="['i-solar:gamepad-minimalistic-bold-duotone', 'absolute inset-4 text-white']" />
        </span>
      </BasicButton>

      <div :class="['text-center text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.instructions') }}
      </div>
    </div>

    <div :class="['flex flex-col gap-3']">
      <div
        :class="[
          'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
          props.active
            ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200'
            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-900/60 dark:text-neutral-300',
        ]"
      >
        <span :class="[props.active ? 'i-solar:gamepad-bold-duotone' : 'i-solar:pause-circle-bold-duotone', 'size-5']" />
        {{ props.active
          ? t('tamagotchi.settings.devtools.pages.live2d-motion.status.active')
          : t('tamagotchi.settings.devtools.pages.live2d-motion.status.released') }}
      </div>

      <div :class="['grid gap-3', 'sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3']">
        <section
          v-for="group in parameterGroups"
          :key="group.label"
          :class="[
            'rounded-2xl border border-neutral-200/80 p-4 dark:border-neutral-800/80',
            'bg-white/60 dark:bg-neutral-950/40',
          ]"
        >
          <div :class="['mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100']">
            {{ group.label }}
          </div>
          <dl :class="['grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm']">
            <dt :class="['text-neutral-500 dark:text-neutral-400']">
              X
            </dt>
            <dd :class="['text-right font-mono text-neutral-800 tabular-nums dark:text-neutral-100']">
              {{ group.x.toFixed(2) }}
            </dd>
            <dt :class="['text-neutral-500 dark:text-neutral-400']">
              Y
            </dt>
            <dd :class="['text-right font-mono text-neutral-800 tabular-nums dark:text-neutral-100']">
              {{ group.y.toFixed(2) }}
            </dd>
          </dl>
        </section>
      </div>

      <div :class="['rounded-xl p-3 text-xs text-neutral-500 dark:text-neutral-400', 'bg-neutral-100/70 dark:bg-neutral-900/50']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.parameter-note') }}
      </div>
    </div>
  </div>
</template>
