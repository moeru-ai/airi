<script setup lang="ts">
import type { SwipeableProps, SwipeableSlotProps } from './swipeable'

import { usePreferredReducedMotion, useSwipe } from '@vueuse/core'
import { animate } from 'animejs'
import { clamp } from 'es-toolkit'
import { computed, onUnmounted, reactive, shallowRef, useTemplateRef, watch } from 'vue'

import { useSwipeGesture } from './use-swipe-gesture'

const props = withDefaults(defineProps<SwipeableProps>(), {
  direction: 'left',
  enabled: true,
  input: 'touch',
  startDistance: 8,
  threshold: 48,
})

const emit = defineEmits<{
  commit: []
  thresholdEnter: []
}>()

defineSlots<{
  default: (props: SwipeableSlotProps) => unknown
}>()

const rootRef = useTemplateRef<HTMLDivElement>('root')
const { state: wheelGesture } = useSwipeGesture(rootRef, {
  filter: event => props.enabled
    && props.input === 'wheel'
    && !event.ctrlKey
    && event.deltaMode === WheelEvent.DOM_DELTA_PIXEL,
})
const {
  lengthX: touchDistanceX,
  lengthY: touchDistanceY,
} = useSwipe(rootRef, {
  threshold: 0,
  onSwipeStart: beginTouchSwipe,
  onSwipe: updateTouchSwipe,
  onSwipeEnd: finishTouchSwipe,
})
const position = reactive({ x: 0 })
const active = shallowRef(false)
const thresholdCrossed = shallowRef(false)
const reducedMotion = usePreferredReducedMotion()
const progress = computed(() => clamp(Math.abs(position.x) / props.threshold, 0, 1))
const slotProps = computed<SwipeableSlotProps>(() => ({
  active: active.value,
  offset: position.x,
  progress: progress.value,
  thresholdCrossed: thresholdCrossed.value,
}))

let returnAnimation: ReturnType<typeof animate> | undefined
// Touch travel stays pending while tap feedback and swipe movement overlap. Once
// an axis is clear, its intent remains locked until touchend or touchcancel.
let touchIntent: 'pending' | 'horizontal' | 'vertical' = 'pending'
let wheelDistance = 0
let wheelIntent: 'pending' | 'horizontal' | 'vertical' = 'pending'
let wheelSessionActive = false
let positionFrame: number | undefined
let pendingPositionX = 0

function directedDistance(deltaX: number) {
  return props.direction === 'left' ? deltaX : -deltaX
}

function mapGestureDistance(distance: number) {
  const rootWidth = rootRef.value?.clientWidth ?? 0
  if (rootWidth <= 0)
    return distance

  const resistanceLength = rootWidth / 4

  // The curve starts with a 1:1 slope, then increases resistance continuously.
  // Its visual distance approaches a quarter row width without reaching a hard stop.
  return resistanceLength * -Math.expm1(-distance / resistanceLength)
}

function setVisualDistance(distance: number) {
  const positiveDistance = Math.max(0, distance)
  const visibleDistance = mapGestureDistance(positiveDistance)
  const direction = props.direction === 'left' ? -1 : 1
  pendingPositionX = direction * visibleDistance

  if (positionFrame !== undefined)
    return

  positionFrame = requestAnimationFrame(() => {
    position.x = pendingPositionX
    positionFrame = undefined
  })
}

function setGestureDistance(distance: number) {
  const positiveDistance = Math.max(0, distance)
  setVisualDistance(positiveDistance)

  const crossed = positiveDistance >= props.threshold
  if (crossed && !thresholdCrossed.value)
    emit('thresholdEnter')
  thresholdCrossed.value = crossed
}

function animatePositionToRest() {
  returnAnimation?.cancel()
  if (positionFrame !== undefined) {
    cancelAnimationFrame(positionFrame)
    positionFrame = undefined
  }
  pendingPositionX = 0

  if (reducedMotion.value === 'reduce') {
    position.x = 0
    return
  }

  returnAnimation = animate(position, {
    x: 0,
    duration: 220,
    ease: 'outQuart',
  })
}

function resetPosition() {
  active.value = false
  thresholdCrossed.value = false
  animatePositionToRest()
}

function beginTouchSwipe() {
  if (!props.enabled || props.input !== 'touch')
    return

  touchIntent = 'pending'
}

function updateTouchSwipe() {
  if (!props.enabled || props.input !== 'touch')
    return

  if (touchIntent === 'vertical')
    return

  const deltaX = touchDistanceX.value
  const deltaY = Math.abs(touchDistanceY.value)
  const distance = directedDistance(deltaX)
  const absoluteDeltaX = Math.abs(deltaX)

  if (touchIntent === 'pending') {
    // Keep the message under the finger while the nested press animation is
    // still active. startDistance decides intent; it is not a visual dead zone.
    if (distance > 0) {
      returnAnimation?.cancel()
      setVisualDistance(distance)
    }

    if (Math.max(absoluteDeltaX, deltaY) < props.startDistance)
      return

    if (deltaY >= absoluteDeltaX) {
      touchIntent = 'vertical'
      animatePositionToRest()
      return
    }

    if (distance <= 0)
      return

    touchIntent = 'horizontal'
    active.value = true
  }

  returnAnimation?.cancel()
  active.value = true
  setGestureDistance(distance)
}

function finishTouchSwipe(event: TouchEvent) {
  if (props.input !== 'touch')
    return

  const shouldCommit = event.type === 'touchend'
    && touchIntent === 'horizontal'
    && props.enabled
    && thresholdCrossed.value
  touchIntent = 'pending'
  resetPosition()
  if (shouldCommit)
    emit('commit')
}

function finishWheelSwipe() {
  if (!wheelSessionActive)
    return

  wheelSessionActive = false
  const shouldCommit = wheelIntent === 'horizontal' && props.enabled && thresholdCrossed.value

  wheelIntent = 'pending'
  wheelDistance = 0
  resetPosition()

  if (shouldCommit)
    emit('commit')
}

function cancelGesture() {
  touchIntent = 'pending'
  wheelIntent = 'pending'
  wheelSessionActive = false
  wheelDistance = 0
  resetPosition()
}

function updateWheelSwipe(state: NonNullable<typeof wheelGesture.value>) {
  if (state.isEnding) {
    finishWheelSwipe()
    return
  }

  if (state.isStart) {
    wheelSessionActive = true
    wheelIntent = 'pending'
    wheelDistance = 0
  }

  // Momentum begins after the fingers leave the trackpad. The reply action
  // uses the direct-pan position and gives the inertial tail to the return.
  if (state.isMomentum) {
    finishWheelSwipe()
    return
  }

  if (wheelIntent === 'vertical')
    return

  const [movementX, movementY] = state.axisMovement
  const distance = directedDistance(movementX)
  if (wheelIntent === 'pending') {
    // One sample near the jitter boundary cannot establish a trackpad axis.
    // Accumulate two start distances so later vertical movement can keep scrolling.
    const intentDistance = Math.min(props.threshold, props.startDistance * 2)
    if (Math.max(Math.abs(movementX), Math.abs(movementY)) < intentDistance)
      return

    const absoluteDeltaX = Math.abs(movementX)
    const absoluteDeltaY = Math.abs(movementY)
    // A 1.5:1 ratio leaves diagonal input pending until the user's intended
    // axis is clear. A vertical or opposite-direction lock lasts until idle.
    if (absoluteDeltaY >= absoluteDeltaX * 1.5
      || (distance <= 0 && absoluteDeltaX >= absoluteDeltaY * 1.5)) {
      wheelIntent = 'vertical'
      return
    }

    if (distance < absoluteDeltaY * 1.5)
      return

    wheelIntent = 'horizontal'
    active.value = true
    returnAnimation?.cancel()
    wheelDistance = Math.max(0, distance)
  }
  else {
    wheelDistance = Math.max(
      0,
      wheelDistance + directedDistance(state.axisDelta[0]),
    )
  }

  if (state.event instanceof WheelEvent && state.event.cancelable)
    state.event.preventDefault()

  active.value = true
  returnAnimation?.cancel()
  setGestureDistance(wheelDistance)
}

watch(wheelGesture, (state) => {
  if (state)
    updateWheelSwipe(state)
}, { flush: 'sync' })

watch(() => [props.enabled, props.input, props.direction], cancelGesture)

onUnmounted(() => {
  returnAnimation?.cancel()
  if (positionFrame !== undefined)
    cancelAnimationFrame(positionFrame)
})
</script>

<template>
  <div
    ref="root"
    data-swipeable
    :data-swipe-active="active"
    :style="{
      touchAction: enabled && input === 'touch' ? 'pan-y' : undefined,
    }"
    :class="['relative']"
  >
    <slot v-bind="slotProps" />
  </div>
</template>
