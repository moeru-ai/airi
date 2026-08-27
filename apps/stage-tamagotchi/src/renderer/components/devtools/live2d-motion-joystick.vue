<script setup lang="ts">
import type { StandardGamepadSnapshot } from '@proj-airi/input-gamepad'
import type { Live2DMotionControlDynamics, Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { getGamepadButtonLabel } from '@proj-airi/input-gamepad'
import { defaultLive2DMotionControlDynamics, neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { BasicButton, Button, FieldRange } from '@proj-airi/ui'
import { useRafFn } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DMotionInputHints from './live2d-motion-input-hints.vue'

const props = defineProps<{
  pose: Live2DMotionControlPose
  dynamics: Live2DMotionControlDynamics
  active: boolean
  disabled?: boolean
  gamepad?: StandardGamepadSnapshot
}>()

const emit = defineEmits<{
  move: [pose: Live2DMotionControlPose]
  release: []
  updateDynamics: [dynamics: Live2DMotionControlDynamics]
}>()

const { t } = useI18n()
const inputActive = shallowRef(false)
const waveEnabled = shallowRef(false)
let wavePhase = 0
let wavePeriodMs = 1500
let waveTargetPeriodMs = 1500
let waveTargetAtMs = 0

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
const eyeSquintKeys = new Set([
  'c',
  'f',
  'r',
])
const movementKeys = new Set([...positionKeys, ...headRollKeys, ...bodyXKeys, ...mouthFormKeys, ...mouthOpenKeys, ...eyeSquintKeys])

let keyboardOwnsInput = false
let gamepadOwnsInput = false
let keyboardOwnsPosition = false
let keyboardOwnsHeadRoll = false
let keyboardOwnsBodyX = false
let keyboardBodyXBase = 0
let keyboardOwnsMouthForm = false
let keyboardMouthFormBase = 0
let keyboardOwnsMouthOpen = false
let keyboardMouthOpenBase = 0
let keyboardOwnsEyeSquint = false
let keyboardEyeSquintBase = 0

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
const gamepadFamily = computed(() => props.gamepad?.family ?? 'unknown')
const inputHints = computed(() => [
  {
    action: t('tamagotchi.settings.devtools.pages.live2d-motion.input-actions.move-body-head'),
    controller: getGamepadButtonLabel(gamepadFamily.value, 'leftStick'),
    keyboard: '← ↑ ↓ →',
  },
  {
    action: t('tamagotchi.settings.devtools.pages.live2d-motion.input-actions.tilt-head'),
    controller: `${getGamepadButtonLabel(gamepadFamily.value, 'rightStick')} ← / →`,
    keyboard: 'Q / E',
  },
  {
    action: t('tamagotchi.settings.devtools.pages.live2d-motion.input-actions.blink'),
    controller: getGamepadButtonLabel(gamepadFamily.value, 'leftTrigger'),
    keyboard: 'C',
  },
  {
    action: t('tamagotchi.settings.devtools.pages.live2d-motion.input-actions.open-mouth'),
    controller: getGamepadButtonLabel(gamepadFamily.value, 'rightTrigger'),
    keyboard: 'Space',
  },
  {
    action: t('tamagotchi.settings.devtools.pages.live2d-motion.input-actions.mouth-shape'),
    keyboard: 'W / S',
  },
])

useRafFn(({ delta, timestamp }) => {
  if (!waveEnabled.value)
    return

  if (timestamp >= waveTargetAtMs) {
    waveTargetPeriodMs = 1500 + Math.random() * 3500
    waveTargetAtMs = timestamp + wavePeriodMs
  }

  wavePeriodMs += (waveTargetPeriodMs - wavePeriodMs) * (1 - Math.exp(-delta / 2000))
  wavePhase += delta / wavePeriodMs * Math.PI * 2
  const vertical = Math.sin(wavePhase)
  const easedVertical = vertical * (1.5 - 0.5 * vertical * vertical)
  inputActive.value = true
  emit('move', {
    ...props.pose,
    headZ: -Math.cos(wavePhase),
    offsetY: easedVertical * 0.64,
  })
})

function toggleWave() {
  waveEnabled.value = !waveEnabled.value
  if (waveEnabled.value) {
    wavePhase = 0
    wavePeriodMs = 1500
    waveTargetPeriodMs = 1500
    waveTargetAtMs = 0
    return
  }

  inputActive.value = false
  emit('release')
}

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
  gamepadOwnsInput = false
  keyboardOwnsInput = false
  keyboardOwnsPosition = false
  keyboardOwnsHeadRoll = false
  keyboardOwnsBodyX = false
  keyboardBodyXBase = 0
  keyboardOwnsMouthForm = false
  keyboardMouthFormBase = 0
  keyboardOwnsMouthOpen = false
  keyboardMouthOpenBase = 0
  keyboardOwnsEyeSquint = false
  keyboardEyeSquintBase = 0
  inputActive.value = false
  emit('release')
}

function handlePointerDown(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0)
    return

  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  pressedKeys.clear()
  gamepadOwnsInput = false
  keyboardOwnsInput = false
  keyboardOwnsPosition = false
  keyboardOwnsHeadRoll = false
  keyboardOwnsBodyX = false
  keyboardBodyXBase = 0
  keyboardOwnsMouthForm = false
  keyboardMouthFormBase = 0
  keyboardOwnsMouthOpen = false
  keyboardMouthOpenBase = 0
  keyboardOwnsEyeSquint = false
  keyboardEyeSquintBase = 0
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
  if (pressedKeys.has('c'))
    pose.eyeSquint = 1
  else if (pressedKeys.has('f'))
    pose.eyeSquint = 2 / 3
  else if (pressedKeys.has('r'))
    pose.eyeSquint = 1 / 3

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
  const eyeSquintKeyActive = [...pressedKeys].some(key => eyeSquintKeys.has(key))
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
    eyeSquint: keyboardOwnsEyeSquint
      ? (eyeSquintKeyActive ? target.eyeSquint : keyboardEyeSquintBase)
      : props.pose.eyeSquint,
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
  if (!eyeSquintKeyActive)
    keyboardOwnsEyeSquint = false

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

  gamepadOwnsInput = false
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
  if (eyeSquintKeys.has(key) && !keyboardOwnsEyeSquint) {
    keyboardEyeSquintBase = props.pose.eyeSquint
    keyboardOwnsEyeSquint = true
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

function handleGamepad(snapshot: StandardGamepadSnapshot | undefined) {
  if (props.disabled)
    return

  if (!snapshot) {
    if (!gamepadOwnsInput)
      return
    gamepadOwnsInput = false
    inputActive.value = false
    emit('release')
    return
  }

  const leftX = snapshot.leftStick.x
  const leftY = -snapshot.leftStick.y
  const headRoll = snapshot.rightStick.x
  const eyeSquint = snapshot.buttons.leftTrigger.value
  const mouthOpen = snapshot.buttons.rightTrigger.value
  const active = Math.abs(leftX) > 0
    || Math.abs(leftY) > 0
    || Math.abs(headRoll) > 0
    || eyeSquint > 0
    || mouthOpen > 0

  if (!active) {
    if (!gamepadOwnsInput)
      return
    gamepadOwnsInput = false
    inputActive.value = false
    emit('release')
    return
  }

  gamepadOwnsInput = true
  inputActive.value = true
  emit('move', {
    ...props.pose,
    bodyX: leftX,
    bodyY: leftY,
    eyeSquint,
    headX: leftX,
    headY: leftY,
    headZ: headRoll,
    mouthOpen,
    offsetX: leftX,
    offsetY: leftY,
  })
}

watch(() => props.disabled, (disabled) => {
  if (!disabled)
    return

  waveEnabled.value = false
  pressedKeys.clear()
  gamepadOwnsInput = false
  keyboardOwnsInput = false
  keyboardOwnsPosition = false
  keyboardOwnsHeadRoll = false
  keyboardOwnsBodyX = false
  keyboardBodyXBase = 0
  keyboardOwnsMouthForm = false
  keyboardMouthFormBase = 0
  keyboardOwnsMouthOpen = false
  keyboardMouthOpenBase = 0
  keyboardOwnsEyeSquint = false
  keyboardEyeSquintBase = 0
  inputActive.value = false
})
watch(() => props.gamepad, handleGamepad, { flush: 'sync' })
</script>

<template>
  <div :class="['flex flex-col gap-5']">
    <div :class="['flex flex-col items-center gap-4']">
      <BasicButton
        type="button"
        size="unset"
        :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.joystick-label')"
        :aria-pressed="props.active"
        :disabled="props.disabled"
        :class="[
          'relative aspect-square w-full max-w-64 touch-none select-none overflow-hidden rounded-full',
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

      <Live2DMotionInputHints
        :hints="inputHints"
        :keyboard-label="t('tamagotchi.settings.devtools.pages.live2d-motion.input.keyboard')"
        :controller-label="t('tamagotchi.settings.devtools.pages.live2d-motion.input.controller')"
        :class="['w-full']"
      />
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

      <div :class="['grid gap-4 rounded-xl bg-neutral-100/70 p-4 dark:bg-neutral-900/50']">
        <Button
          type="button"
          color="cyan"
          :variant="waveEnabled ? 'primary' : 'secondary'"
          :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.wave.toggle')"
          :aria-pressed="waveEnabled"
          :disabled="props.disabled"
          @click="toggleWave"
        >
          <span :class="[waveEnabled ? 'i-solar:water-bold-duotone' : 'i-solar:water-linear', 'size-4']" />
          {{ t('tamagotchi.settings.devtools.pages.live2d-motion.wave.toggle') }}
        </Button>
        <FieldRange
          v-model="follow"
          :label="t('tamagotchi.settings.devtools.pages.live2d-motion.spring.follow.label')"
          :description="t('tamagotchi.settings.devtools.pages.live2d-motion.spring.follow.description')"
          :min="0"
          :max="2"
          :step="0.01"
          :default-value="defaultLive2DMotionControlDynamics.follow"
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
          :default-value="defaultLive2DMotionControlDynamics.inertia"
          :format-value="formatPercent"
          as="div"
        />
      </div>
    </div>
  </div>
</template>
