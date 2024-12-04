<script setup lang="ts">
import { computed, ref } from 'vue'

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const sliderRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)

// Scale factor for internal calculations
const SCALE_FACTOR = 100

function getStepPrecision(step: number): number {
  const stepStr = step.toString()
  if (stepStr.includes('e-')) {
    return Number.parseInt(stepStr.split('e-')[1], 10)
  }
  const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0
  return decimals
}

function scaleUp(value: number): number {
  return value * SCALE_FACTOR
}

function scaleDown(value: number): number {
  return value / SCALE_FACTOR
}

function roundToStep(value: number, step: number): number {
  const scaledValue = scaleUp(value)
  const scaledStep = scaleUp(step)
  const precision = getStepPrecision(step)

  const rounded = Math.round(scaledValue / scaledStep) * scaledStep
  const scaledBack = scaleDown(rounded)

  return Number(scaledBack.toFixed(precision))
}

function valueToPercent(value: number, min: number, max: number) {
  const scaledValue = scaleUp(value)
  const scaledMin = scaleUp(min)
  const scaledMax = scaleUp(max)
  return ((scaledValue - scaledMin) * 100) / (scaledMax - scaledMin)
}

function percentToValue(percent: number, min: number, max: number) {
  const scaledMin = scaleUp(min)
  const scaledMax = scaleUp(max)
  const scaledValue = (scaledMax - scaledMin) * percent + scaledMin
  const value = scaleDown(scaledValue)
  return roundToStep(value, props.step)
}

const currentValue = computed(() => {
  return roundToStep(clamp(props.modelValue, props.min, props.max), props.step)
})

const sliderStyle = computed(() => {
  const sliderPercent = valueToPercent(currentValue.value, props.min, props.max)
  return {
    width: `${sliderPercent}%`,
    backgroundSize: `${sliderPercent}% 100%`,
  }
})

function getNewValue(event: MouseEvent) {
  if (!sliderRef.value)
    return currentValue.value

  const { width, left } = sliderRef.value.getBoundingClientRect()
  const percent = clamp((event.clientX - left) / width, 0, 1)
  return percentToValue(percent, props.min, props.max)
}

function handleMouseDown(event: MouseEvent) {
  if (props.disabled)
    return

  event.preventDefault()
  isDragging.value = true
  emit('mousedown', event)

  const newValue = getNewValue(event)
  emit('update:modelValue', newValue)
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value || props.disabled)
    return

  const newValue = getNewValue(event)
  emit('update:modelValue', newValue)
}

function handleMouseUp(_: MouseEvent) {
  if (!isDragging.value)
    return

  isDragging.value = false
}

function handleMouseLeave(event: MouseEvent) {
  if (!isDragging.value)
    return
  handleMouseUp(event)
}
</script>

<template>
  <span
    ref="sliderRef"
    class="range-slider disabled:pointer-events-none disabled:cursor-default disabled:opacity-50"
    :class="{ disabled }"
    bg="[#e6e1fc] dark:[#676085]" touch-action-none relative inline-block w-full cursor-ew-resize rounded-sm
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
  >
    <span :style="sliderStyle" bg="[#cabeff] dark:[#4e34b9]" relative block rounded-sm h="[14px]" />
    <span
      role="slider"
      class="slider-thumb"
      :style="{ left: `${valueToPercent(currentValue, min, max)}%` }"
      absolute rounded-sm w="[1px]" h="[14px]" bg="zinc-100 dark:zinc-400" top="50%" transform="translate-x-[50%] translate-y-[-50%]"
    />
  </span>
</template>
