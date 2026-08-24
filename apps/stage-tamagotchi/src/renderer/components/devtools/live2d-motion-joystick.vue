<script setup lang="ts">
import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { BasicButton } from '@proj-airi/ui'
import { computed, onUnmounted, shallowRef, watch } from 'vue'
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
const positionKeys = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  's',
  'w',
])
const headRollKeys = new Set([
  'e',
  'q',
])
const bodyRollKeys = new Set([
  'a',
  'd',
])
const movementKeys = new Set([...positionKeys, ...headRollKeys, ...bodyRollKeys])
const neutralPose: Live2DMotionControlPose = Object.freeze({ x: 0, y: 0, headZ: 0, bodyZ: 0 })

let keyboardFrame: number | undefined
let keyboardFrameTime: number | undefined
let keyboardOwnsInput = false
let keyboardOwnsPosition = false
let keyboardOwnsHeadRoll = false
let keyboardOwnsBodyRoll = false
let keyboardPose = neutralPose

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
    z: props.pose.headZ * 30,
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.body'),
    x: props.pose.x * 10,
    y: props.pose.y * 10,
    z: props.pose.bodyZ * 10,
  },
])

function setPosition(x: number, y: number) {
  const magnitude = Math.hypot(x, y)
  const scale = magnitude > 1 ? 1 / magnitude : 1
  inputActive.value = true
  emit('move', {
    x: x * scale,
    y: y * scale,
    headZ: props.pose.headZ,
    bodyZ: props.pose.bodyZ,
  })
}

function setPositionFromPointer(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  const bounds = target.getBoundingClientRect()
  const radius = Math.min(bounds.width, bounds.height) / 2
  setPosition(
    (event.clientX - (bounds.left + bounds.width / 2)) / radius,
    ((bounds.top + bounds.height / 2) - event.clientY) / radius,
  )
}

function cancelKeyboardFrame() {
  if (keyboardFrame !== undefined)
    cancelAnimationFrame(keyboardFrame)

  keyboardFrame = undefined
  keyboardFrameTime = undefined
}

function releaseImmediately() {
  if (!inputActive.value)
    return

  cancelKeyboardFrame()
  pressedKeys.clear()
  keyboardOwnsInput = false
  keyboardOwnsPosition = false
  keyboardOwnsHeadRoll = false
  keyboardOwnsBodyRoll = false
  keyboardPose = neutralPose
  inputActive.value = false
  emit('release')
}

function handlePointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0)
    return

  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  cancelKeyboardFrame()
  pressedKeys.clear()
  keyboardOwnsInput = false
  keyboardOwnsPosition = false
  keyboardOwnsHeadRoll = false
  keyboardOwnsBodyRoll = false
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
  releaseImmediately()
}

function keyboardPosition(): Live2DMotionControlPose {
  const left = pressedKeys.has('ArrowLeft')
  const right = pressedKeys.has('ArrowRight')
  const down = pressedKeys.has('ArrowDown') || pressedKeys.has('s')
  const up = pressedKeys.has('ArrowUp') || pressedKeys.has('w')
  const x = Number(right) - Number(left)
  const y = Number(up) - Number(down)
  const magnitude = Math.hypot(x, y)
  const scale = magnitude > 1 ? 1 / magnitude : 1

  return {
    x: x * scale,
    y: y * scale,
    headZ: Number(pressedKeys.has('e')) - Number(pressedKeys.has('q')),
    bodyZ: Number(pressedKeys.has('d')) - Number(pressedKeys.has('a')),
  }
}

function moveAxisTowards(current: number, target: number, maximumStep: number): number {
  if (Math.abs(target - current) <= maximumStep)
    return target

  return current + Math.sign(target - current) * maximumStep
}

function keyboardAxesMatchTarget(pose: Live2DMotionControlPose, target: Live2DMotionControlPose): boolean {
  return (!keyboardOwnsPosition || (pose.x === target.x && pose.y === target.y))
    && (!keyboardOwnsHeadRoll || pose.headZ === target.headZ)
    && (!keyboardOwnsBodyRoll || pose.bodyZ === target.bodyZ)
}

function poseIsNeutral(pose: Live2DMotionControlPose): boolean {
  return pose.x === 0
    && pose.y === 0
    && pose.headZ === 0
    && pose.bodyZ === 0
}

function updateKeyboardPose(timestamp: number) {
  keyboardFrame = undefined
  const elapsedSeconds = keyboardFrameTime === undefined
    ? 1 / 60
    : Math.min((timestamp - keyboardFrameTime) / 1000, 0.1)
  keyboardFrameTime = timestamp

  // Four normalized units per second gives each key a 250 ms full-range ramp.
  const maximumStep = elapsedSeconds * 4
  const target = keyboardPosition()
  keyboardPose = {
    x: keyboardOwnsPosition ? moveAxisTowards(keyboardPose.x, target.x, maximumStep) : props.pose.x,
    y: keyboardOwnsPosition ? moveAxisTowards(keyboardPose.y, target.y, maximumStep) : props.pose.y,
    headZ: keyboardOwnsHeadRoll ? moveAxisTowards(keyboardPose.headZ, target.headZ, maximumStep) : props.pose.headZ,
    bodyZ: keyboardOwnsBodyRoll ? moveAxisTowards(keyboardPose.bodyZ, target.bodyZ, maximumStep) : props.pose.bodyZ,
  }
  inputActive.value = true
  emit('move', keyboardPose)

  if (!keyboardAxesMatchTarget(keyboardPose, target)) {
    keyboardFrame = requestAnimationFrame(updateKeyboardPose)
    return
  }

  keyboardFrameTime = undefined
  if (![...pressedKeys].some(key => positionKeys.has(key)))
    keyboardOwnsPosition = false
  if (![...pressedKeys].some(key => headRollKeys.has(key)))
    keyboardOwnsHeadRoll = false
  if (![...pressedKeys].some(key => bodyRollKeys.has(key)))
    keyboardOwnsBodyRoll = false

  if (pressedKeys.size > 0)
    return

  keyboardOwnsInput = false
  if (!poseIsNeutral(keyboardPose))
    return

  keyboardPose = neutralPose
  inputActive.value = false
  emit('release')
}

function scheduleKeyboardUpdate() {
  if (keyboardFrame === undefined)
    keyboardFrame = requestAnimationFrame(updateKeyboardPose)
}

function handleKeyDown(event: KeyboardEvent) {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (!movementKeys.has(key))
    return

  event.preventDefault()
  if (pressedKeys.has(key))
    return

  if (!keyboardOwnsInput)
    keyboardPose = props.pose

  keyboardOwnsInput = true
  if (positionKeys.has(key))
    keyboardOwnsPosition = true
  if (headRollKeys.has(key))
    keyboardOwnsHeadRoll = true
  if (bodyRollKeys.has(key))
    keyboardOwnsBodyRoll = true
  pressedKeys.add(key)
  scheduleKeyboardUpdate()
}

function handleKeyUp(event: KeyboardEvent) {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (!movementKeys.has(key))
    return

  event.preventDefault()
  pressedKeys.delete(key)
  scheduleKeyboardUpdate()
}

function handleBlur() {
  if (!keyboardOwnsInput) {
    releaseImmediately()
    return
  }

  pressedKeys.clear()
  scheduleKeyboardUpdate()
}

watch(() => props.disabled, (disabled) => {
  if (!disabled)
    return

  cancelKeyboardFrame()
  pressedKeys.clear()
  keyboardOwnsInput = false
  keyboardOwnsPosition = false
  keyboardOwnsHeadRoll = false
  keyboardOwnsBodyRoll = false
  keyboardPose = neutralPose
  inputActive.value = false
})

onUnmounted(cancelKeyboardFrame)
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
        @blur="handleBlur"
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
            <template v-if="group.z !== undefined">
              <dt :class="['text-neutral-500 dark:text-neutral-400']">
                Z
              </dt>
              <dd :class="['text-right font-mono text-neutral-800 tabular-nums dark:text-neutral-100']">
                {{ group.z.toFixed(2) }}
              </dd>
            </template>
          </dl>
        </section>
      </div>

      <div :class="['rounded-xl p-3 text-xs text-neutral-500 dark:text-neutral-400', 'bg-neutral-100/70 dark:bg-neutral-900/50']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.parameter-note') }}
      </div>
    </div>
  </div>
</template>
