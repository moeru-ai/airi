<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  values: number[]
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
  (e: 'update:values', value: number[]): void
  (e: 'mousedown', event: MouseEvent): void
}>()

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const sliderRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const previousIndex = ref<number>(0)

// Utility functions
const asc = (a: number, b: number) => a - b

function findClosest(values: number[], currentValue: number) {
  const { index: closestIndex } = values.reduce((acc: { distance: number, index: number } | null, value: number, index: number) => {
    const distance = Math.abs(currentValue - value)
    if (acc === null || distance < acc.distance || distance === acc.distance) {
      return { distance, index }
    }
    return acc
  }, null) || { index: 0 }
  return closestIndex
}

function valueToPercent(value: number, min: number, max: number) {
  return ((value - min) * 100) / (max - min)
}

function percentToValue(percent: number, min: number, max: number) {
  return (max - min) * percent + min
}

function getDecimalPrecision(num: number) {
  if (Math.abs(num) < 1) {
    const parts = num.toExponential().split('e-')
    const matissaDecimalPart = parts[0].split('.')[1]
    return (matissaDecimalPart ? matissaDecimalPart.length : 0) + Number.parseInt(parts[1], 10)
  }
  const decimalPart = num.toString().split('.')[1]
  return decimalPart ? decimalPart.length : 0
}

function roundValueToStep(value: number, step: number) {
  const nearest = Math.round(value / step) * step
  return Number(nearest.toFixed(getDecimalPrecision(step)))
}

// Computed values
const sortedValues = computed(() => {
  return [...props.values]
    .sort(asc)
    .map(value => clamp(value, props.min, props.max))
})

const sliderStyle = computed(() => {
  const sliderOffset = valueToPercent(sortedValues.value[0], props.min, props.max)
  const sliderLeap = valueToPercent(sortedValues.value[sortedValues.value.length - 1], props.min, props.max) - sliderOffset
  return {
    left: `${sliderOffset}%`,
    width: `${sliderLeap}%`,
    backgroundSize: `${sliderLeap}% 100%`,
  }
})

// Event handlers
function getNewValue(event: MouseEvent, move = false) {
  if (!sliderRef.value)
    return { newValue: sortedValues.value, activeIndex: 0 }

  const { width, left } = sliderRef.value.getBoundingClientRect()
  const percent = (event.clientX - left) / width

  let currentValue = percentToValue(percent, props.min, props.max)
  currentValue = roundValueToStep(currentValue, props.step)
  currentValue = clamp(currentValue, props.min, props.max)

  const activeIndex = move ? previousIndex.value : findClosest(sortedValues.value, currentValue)

  const newValues = [...sortedValues.value]
  newValues[activeIndex] = currentValue
  const sortedNewValues = [...newValues].sort(asc)

  const newActiveIndex = sortedNewValues.indexOf(currentValue)
  previousIndex.value = newActiveIndex

  return {
    newValue: sortedNewValues,
    activeIndex: newActiveIndex,
  }
}

function handleMouseDown(event: MouseEvent) {
  if (props.disabled)
    return

  event.preventDefault()
  isDragging.value = true
  emit('mousedown', event)

  const { newValue } = getNewValue(event)
  emit('update:values', newValue)
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value || props.disabled)
    return

  const { newValue } = getNewValue(event, true)
  emit('update:values', newValue)
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
    class="range-slider"
    :class="{ disabled }"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseLeave"
  >
    <span
      class="slider-track"
      :style="sliderStyle"
    />
    <span
      v-for="(value, index) in sortedValues"
      :key="index"
      role="slider"
      class="slider-thumb"
      :style="{ left: `${valueToPercent(value, min, max)}%` }"
      :data-index="index"
    />
  </span>
</template>

<style scoped>
.range-slider {
  width: 100%;
  box-sizing: border-box;
  display: inline-block;
  cursor: ew-resize;
  touch-action: none;
  border: 3px solid #4bb9fd;
  position: relative;
}

.range-slider.disabled {
  cursor: default;
  pointer-events: none;
  opacity: 0.5;
}

.slider-track {
  display: block;
  position: relative;
  background-color: #4bb9fd;
  background-image: linear-gradient(90deg, var(--primary-light), var(--primary-light));
  background-repeat: no-repeat;
  height: 14px;
}

.slider-thumb {
  position: absolute;
  width: 10px;
  height: 10px;
  background: white;
  top: 50%;
  transform: translate(-50%, -50%);
}
</style>
