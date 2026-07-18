<script setup lang="ts">
import { onMounted, onUnmounted, ref, toRef } from 'vue'

const props = withDefaults(defineProps<{
  baseSpeed?: number
  friction?: number
  momentumFactor?: number
}>(), {
  baseSpeed: 0.1,
  friction: 0.95,
  momentumFactor: 0.005,
})

const momentum = ref(1) // Base momentum
const currentValue = ref(0)
let lastTimestamp = 0

// Physics parameters with defaults
const FRICTION = toRef(() => props.friction)
const BASE_SPEED = toRef(() => props.baseSpeed)
const MOMENTUM_FACTOR = toRef(() => props.momentumFactor)

function updateMomentum(timestamp: number) {
  if (!lastTimestamp)
    lastTimestamp = timestamp
  const deltaTime = timestamp - lastTimestamp
  lastTimestamp = timestamp

  // Apply friction to gradually return to base speed
  momentum.value = BASE_SPEED.value + (momentum.value - BASE_SPEED.value) * FRICTION.value

  // Update value based on current momentum
  currentValue.value += momentum.value * deltaTime

  requestAnimationFrame(updateMomentum)
}

function handleMouseMove(event: MouseEvent) {
  // Calculate movement speed
  const speed = Math.sqrt(
    event.movementX ** 2
    + event.movementY ** 2,
  )

  // Add to current momentum
  momentum.value += speed * MOMENTUM_FACTOR.value
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove)
  requestAnimationFrame(updateMomentum)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove)
})

// Expose values and momentum to parent
defineExpose({
  momentum,
  currentValue,
})
</script>

<template>
  <slot
    :momentum="momentum"
    :current-value="currentValue"
  />
</template>
