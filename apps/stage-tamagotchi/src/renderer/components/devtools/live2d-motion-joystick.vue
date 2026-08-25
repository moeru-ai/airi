<script setup lang="ts">
import type { Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { BasicButton, FieldRange } from '@proj-airi/ui'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  pose: Live2DMotionControlPose
  dynamics: Live2DMotionControlDynamics
  active: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  move: [pose: Live2DMotionControlPose]
  release: []
  updateDynamics: [dynamics: Live2DMotionControlDynamics]
}>()

const { t } = useI18n()
const inputActive = shallowRef(false)
const pressedKeys = new Set<string>()
const positionKeys = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
])
const headRollKeys = new Set([
  'e',
  'q',
])
const bodyXKeys = new Set([
  'a',
  'd',
])
const mouthFormKeys = new Set([
  's',
  'w',
])
const mouthOpenKeys = new Set([' '])
const movementKeys = new Set([...positionKeys, ...headRollKeys, ...bodyXKeys, ...mouthFormKeys, ...mouthOpenKeys])

let keyboardOwnsInput = false
let keyboardOwnsPosition = false
let keyboardOwnsHeadRoll = false
let keyboardOwnsBodyX = false
let keyboardBodyXBase = 0
let keyboardOwnsMouthForm = false
let keyboardMouthFormBase = 0
let keyboardOwnsMouthOpen = false
let keyboardMouthOpenBase = 0

const knobStyle = computed(() => ({
  transform: `translate(calc(-50% + ${props.pose.headX * 5.75}rem), calc(-50% - ${props.pose.headY * 5.75}rem))`,
}))

const follow = computed({
  get: () => props.dynamics.follow,
  set: value => emit('updateDynamics', { ...props.dynamics, follow: value }),
})
const inertia = computed({
  get: () => props.dynamics.inertia,
  set: value => emit('updateDynamics', { ...props.dynamics, inertia: value }),
})
const formatPercent = (value: number) => `${Math.round(value * 100)}%`

const parameterGroups = computed(() => [
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.eyes'),
    x: props.pose.eyeX,
    y: props.pose.eyeY,
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.head'),
    x: props.pose.headX * 30,
    y: props.pose.headY * 30,
    z: props.pose.headZ * 30,
  },
  {
    label: t('tamagotchi.settings.devtools.pages.live2d-motion.groups.body'),
    x: props.pose.bodyX * 10,
    y: props.pose.bodyY * 10,
    z: props.pose.bodyZ * 10,
  },
])

function setPosition(x: number, y: number) {
  const magnitude = Math.hypot(x, y)
  const scale = magnitude > 1 ? 1 / magnitude : 1
  inputActive.value = true
  emit('move', {
    ...props.pose,
    eyeX: x * scale,
    eyeY: y * scale,
    headX: x * scale,
    headY: y * scale,
    bodyX: x * scale,
    bodyY: y * scale,
    offsetX: x * scale,
    offsetY: y * scale,
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

function releaseImmediately() {
  if (!inputActive.value)
    return

  pressedKeys.clear()
  keyboardOwnsInput = false
  keyboardOwnsPosition = false
  keyboardOwnsHeadRoll = false
  keyboardOwnsBodyX = false
  keyboardBodyXBase = 0
  keyboardOwnsMouthForm = false
  keyboardMouthFormBase = 0
  keyboardOwnsMouthOpen = false
  keyboardMouthOpenBase = 0
  inputActive.value = false
  emit('release')
}

function handlePointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0)
    return

  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
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
  const down = pressedKeys.has('ArrowDown')
  const up = pressedKeys.has('ArrowUp')
  const x = Number(right) - Number(left)
  const y = Number(up) - Number(down)
  const magnitude = Math.hypot(x, y)
  const scale = magnitude > 1 ? 1 / magnitude : 1

  const pose: Live2DMotionControlPose = {
    ...neutralLive2DMotionControlPose,
    eyeX: x * scale,
    eyeY: y * scale,
    headX: x * scale,
    headY: y * scale,
    bodyX: x * scale,
    bodyY: y * scale,
    offsetX: x * scale,
    offsetY: y * scale,
    headZ: Number(pressedKeys.has('e')) - Number(pressedKeys.has('q')),
  }

  if ([...pressedKeys].some(key => bodyXKeys.has(key)))
    pose.bodyX = Number(pressedKeys.has('d')) - Number(pressedKeys.has('a'))
  if ([...pressedKeys].some(key => mouthFormKeys.has(key)))
    pose.mouthForm = Number(pressedKeys.has('w')) - Number(pressedKeys.has('s'))
  if (pressedKeys.has(' '))
    pose.mouthOpen = 1

  return pose
}

function poseIsNeutral(pose: Live2DMotionControlPose): boolean {
  return Object.values(pose).every(value => value === 0)
}

function emitKeyboardTarget() {
  const target = keyboardPosition()
  const bodyXKeyActive = [...pressedKeys].some(key => bodyXKeys.has(key))
  const mouthFormKeyActive = [...pressedKeys].some(key => mouthFormKeys.has(key))
  const mouthOpenKeyActive = pressedKeys.has(' ')
  const nextPose = {
    eyeX: keyboardOwnsPosition ? target.eyeX : props.pose.eyeX,
    eyeY: keyboardOwnsPosition ? target.eyeY : props.pose.eyeY,
    headX: keyboardOwnsPosition ? target.headX : props.pose.headX,
    headY: keyboardOwnsPosition ? target.headY : props.pose.headY,
    headZ: keyboardOwnsHeadRoll ? target.headZ : props.pose.headZ,
    bodyX: keyboardOwnsBodyX
      ? (bodyXKeyActive ? target.bodyX : keyboardBodyXBase)
      : (keyboardOwnsPosition ? target.bodyX : props.pose.bodyX),
    bodyY: keyboardOwnsPosition ? target.bodyY : props.pose.bodyY,
    bodyZ: props.pose.bodyZ,
    mouthForm: keyboardOwnsMouthForm
      ? (mouthFormKeyActive ? target.mouthForm : keyboardMouthFormBase)
      : props.pose.mouthForm,
    mouthOpen: keyboardOwnsMouthOpen
      ? (mouthOpenKeyActive ? target.mouthOpen : keyboardMouthOpenBase)
      : props.pose.mouthOpen,
    offsetX: keyboardOwnsPosition ? target.offsetX : props.pose.offsetX,
    offsetY: keyboardOwnsPosition ? target.offsetY : props.pose.offsetY,
  }
  inputActive.value = true
  emit('move', nextPose)

  if (![...pressedKeys].some(key => positionKeys.has(key)))
    keyboardOwnsPosition = false
  if (![...pressedKeys].some(key => headRollKeys.has(key)))
    keyboardOwnsHeadRoll = false
  if (!bodyXKeyActive)
    keyboardOwnsBodyX = false
  if (!mouthFormKeyActive)
    keyboardOwnsMouthForm = false
  if (!mouthOpenKeyActive)
    keyboardOwnsMouthOpen = false

  if (pressedKeys.size > 0)
    return

  keyboardOwnsInput = false
  if (!poseIsNeutral(nextPose))
    return

  inputActive.value = false
  emit('release')
}

function handleKeyDown(event: KeyboardEvent) {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (!movementKeys.has(key))
    return

  event.preventDefault()
  if (pressedKeys.has(key))
    return

  keyboardOwnsInput = true
  if (positionKeys.has(key))
    keyboardOwnsPosition = true
  if (headRollKeys.has(key))
    keyboardOwnsHeadRoll = true
  if (bodyXKeys.has(key) && !keyboardOwnsBodyX) {
    keyboardBodyXBase = props.pose.bodyX
    keyboardOwnsBodyX = true
  }
  if (mouthFormKeys.has(key) && !keyboardOwnsMouthForm) {
    keyboardMouthFormBase = props.pose.mouthForm
    keyboardOwnsMouthForm = true
  }
  if (mouthOpenKeys.has(key) && !keyboardOwnsMouthOpen) {
    keyboardMouthOpenBase = props.pose.mouthOpen
    keyboardOwnsMouthOpen = true
  }
  pressedKeys.add(key)
  emitKeyboardTarget()
}

function handleKeyUp(event: KeyboardEvent) {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (!movementKeys.has(key))
    return

  event.preventDefault()
  if (!pressedKeys.delete(key))
    return
  emitKeyboardTarget()
}

function handleBlur() {
  if (!keyboardOwnsInput) {
    releaseImmediately()
    return
  }

  pressedKeys.clear()
  emitKeyboardTarget()
}

watch(() => props.disabled, (disabled) => {
  if (!disabled)
    return

  pressedKeys.clear()
  keyboardOwnsInput = false
  keyboardOwnsPosition = false
  keyboardOwnsHeadRoll = false
  keyboardOwnsBodyX = false
  keyboardBodyXBase = 0
  keyboardOwnsMouthForm = false
  keyboardMouthFormBase = 0
  keyboardOwnsMouthOpen = false
  keyboardMouthOpenBase = 0
  inputActive.value = false
})
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

      <div :class="['grid gap-4 rounded-2xl border border-neutral-200/80 p-4 dark:border-neutral-800/80', 'bg-white/60 dark:bg-neutral-950/40', 'sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2']">
        <FieldRange
          v-model="follow"
          :label="t('tamagotchi.settings.devtools.pages.live2d-motion.spring.follow.label')"
          :description="t('tamagotchi.settings.devtools.pages.live2d-motion.spring.follow.description')"
          :min="0"
          :max="2"
          :step="0.01"
          :default-value="0.6"
          :format-value="formatPercent"
          as="div"
        />
        <FieldRange
          v-model="inertia"
          :label="t('tamagotchi.settings.devtools.pages.live2d-motion.spring.inertia.label')"
          :description="t('tamagotchi.settings.devtools.pages.live2d-motion.spring.inertia.description')"
          :min="0"
          :max="1"
          :step="0.01"
          :default-value="0.35"
          :format-value="formatPercent"
          as="div"
        />
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
