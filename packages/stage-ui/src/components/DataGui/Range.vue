<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'mousedown', event: MouseEvent): void
}>()

const sliderRef = ref<HTMLElement | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getStepPrecision(step: number): number {
  const stepStr = step.toString()
  if (stepStr.includes('e-')) {
    return Number.parseInt(stepStr.split('e-')[1], 10)
  }

  const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0
  return decimals
}

function roundToStep(value: number, step: number): number {
  const precision = getStepPrecision(step)
  const factor = 10 ** (precision + 3)
  return Number.parseFloat((value * factor / factor).toFixed(precision))
}

const currentValue = computed(() => {
  return roundToStep(clamp(props.modelValue, props.min, props.max), props.step)
})

const sliderStyle = computed(() => {
  const percent = ((currentValue.value - props.min) / (props.max - props.min)) * 100
  return {
    width: `${percent}%`,
    backgroundSize: `${percent}% 100%`,
  }
})

function getNewValue(event: MouseEvent) {
  if (!sliderRef.value)
    return currentValue.value

  const rect = sliderRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const percent = x / rect.width
  const range = props.max - props.min
  const value = props.min + (range * percent)

  // Round to nearest step
  const steps = Math.round(value / props.step) * props.step
  return Math.min(Math.max(steps, props.min), props.max)
}

function handleMouseMove(event: MouseEvent) {
  if (props.disabled)
    return

  const newValue = getNewValue(event)
  emit('update:modelValue', newValue)
}

function handleMouseDown(event: MouseEvent) {
  if (props.disabled)
    return

  event.preventDefault()

  const newValue = getNewValue(event)
  emit('update:modelValue', newValue)

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}

function handleMouseUp(_: MouseEvent) {
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
}

// Lifecycle hooks
onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
})
</script>

<template>
  <span
    ref="sliderRef"
    class="range-slider disabled:pointer-events-none disabled:cursor-default disabled:opacity-50"
    :class="{ disabled }"
    bg="[#e6e1fc] dark:[#676085]" touch-action-none relative inline-block w-full cursor-ew-resize rounded-sm
    @mousedown="handleMouseDown"
  >
    <span :style="sliderStyle" bg="[#cabeff] dark:[#4e34b9]" relative block rounded-sm h="[14px]" />
    <span
      role="slider"
      class="slider-thumb"
      :style="{ left: `${((currentValue - min) / (max - min)) * 100}%` }"
      absolute rounded-sm w="[1px]" h="[14px]" bg="zinc-100 dark:zinc-400" top="50%" transform="translate-x-[50%] translate-y-[-50%]"
    />
  </span>
</template>
