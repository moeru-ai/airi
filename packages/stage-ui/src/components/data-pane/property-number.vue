<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

interface RangeConfig {
  min?: number
  max?: number
  step?: number
  label?: string
  formatValue?: (val: number) => string
  precision?: number
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  label?: string
  config?: RangeConfig
}>(), {
  label: 'Range',
})

const modelValue = defineModel<number>({ required: true })

// Dragging state for input
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartValue = ref(0)

const sliderRef = ref<HTMLInputElement>()

function postProcessValue(val: number, config?: RangeConfig): string {
  if (config?.formatValue) {
    return config.formatValue(val)
  }

  if (config?.precision !== undefined) {
    return val.toFixed(config.precision)
  }

  return val.toString()
}

const normalizedValue = ref(postProcessValue(modelValue.value, props.config))

watch(modelValue, () => {
  normalizedValue.value = postProcessValue(modelValue.value, props.config)
  updateSliderProgress()
}, { immediate: true })

function updateSliderProgress() {
  if (!sliderRef.value)
    return

  const min = props.config?.min ?? 0
  const max = props.config?.max ?? 100
  const value = modelValue.value

  sliderRef.value.style.setProperty('--value', value.toString())
  sliderRef.value.style.setProperty('--min', min.toString())
  sliderRef.value.style.setProperty('--max', max.toString())
}

onMounted(() => {
  updateSliderProgress()
})

function handleSliderChange(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number.parseFloat(input.value)

  if (!Number.isNaN(value)) {
    updateValue(value)
  }
}

function handleInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number.parseFloat(input.value)

  if (Number.isNaN(value))
    return

  updateValue(value)
}

function updateValue(value: number) {
  const config = props.config
  const min = config?.min ?? 0
  const max = config?.max ?? 100

  // Apply min/max constraints
  value = Math.max(min, Math.min(max, value))

  modelValue.value = value
  normalizedValue.value = postProcessValue(value, config)
}

function startDrag(event: MouseEvent) {
  if (props.config?.disabled)
    return

  event.preventDefault()
  isDragging.value = true
  dragStartX.value = event.clientX
  dragStartValue.value = modelValue.value

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'ew-resize'
}

function onDrag(event: MouseEvent) {
  if (!isDragging.value)
    return

  const deltaX = event.clientX - dragStartX.value
  const config = props.config
  const sensitivity = config?.step || 0.01
  const newValue = dragStartValue.value + (deltaX * sensitivity)

  updateValue(newValue)
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
}
</script>

<template>
  <div>
    <slot name="label">
      <span text-nowrap text-xs>{{ props.label }}</span>
    </slot>
  </div>
  <div />
  <div

    h="5"
    grid-col-span-2 w-full
  >
    <input
      ref="sliderRef"
      :value="modelValue"
      type="range"
      :min="props.config?.min ?? 0"
      :max="props.config?.max ?? 100"
      :step="props.config?.step ?? 1"
      :disabled="props.config?.disabled"
      class="range-slider"
      h-full w-full appearance-none bg-transparent outline-none
      @input="handleSliderChange"
    >
  </div>

  <!-- Value input -->
  <label
    bg="neutral-100 dark:neutral-900"
    h-fit min-w-12 inline-flex items-center rounded-md px="1.5" py="0.5"
  >
    <span h-fit w-full inline-flex items-center gap-2 text-xs>
      <span
        cursor-col-resize
        select-none
        :class="{ 'text-blue-500': isDragging }"
        @mousedown="startDrag"
      >|</span>
      <input
        :value="normalizedValue"
        type="number"
        :min="props.config?.min"
        :max="props.config?.max"
        :step="props.config?.step || 0.0001"
        :disabled="props.config?.disabled"
        max-w-4lh w-full flex-1 appearance-none bg-transparent text-right font-mono outline-none
        transition="all duration-200 ease-in-out"
        class="[&::-webkit-inner-spin-button]:(m-0 appearance-none)"
        @change="handleInputChange"
      >
    </span>
  </label>
</template>

<style scoped>
.range-slider {
  --range: calc(var(--max) - var(--min));
  --ratio: calc((var(--value) - var(--min)) / var(--range));
  --progress: calc(var(--ratio) * 100%);

  --progress-color: rgb(204 204 204 / 53%);
  --track-color: rgb(245 245 245 / 75%);

  transition: all 0.2s ease-in-out;
}

.range-slider:hover {
  --progress-color: rgb(95 95 95 / 53%);
}

.dark .range-slider {
  --progress-color: rgba(151, 151, 151, 0.8);
  --track-color: rgb(23, 23, 23);
}

.range-slider::-webkit-slider-runnable-track {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(
    to right,
    var(--progress-color) 0%,
    var(--progress-color) var(--progress),
    var(--track-color) var(--progress),
    var(--track-color) 100%
  );
  cursor: col-resize;
  transition: all 0.2s ease-in-out;
}

.range-slider::-webkit-slider-thumb {
  appearance: none;
  width: 2px;
  height: 100%;
  background: transparent;
  border: none;
  cursor: col-resize;
  transition: all 0.2s ease;
}

.range-slider::-webkit-slider-thumb:hover {
  background: rgba(255, 255, 255, 0);
  width: 6px;
}

.range-slider::-moz-range-track {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(
    to right,
    rgb(198, 198, 198) 0%,
    rgba(198, 198, 198) var(--progress),
    rgb(236, 236, 236) var(--progress),
    rgba(236, 236, 236) 100%
  );
  backdrop-filter: blur(4px);
  cursor: col-resize;
  border: none;
}

.dark .range-slider::-moz-range-track {
  background: linear-gradient(
    to right,
    rgba(151, 151, 151, 0.8) 0%,
    rgba(151, 151, 151, 0.8) var(--progress),
    rgba(23, 23, 23) var(--progress),
    rgba(23, 23, 23) 100%
  );
}

.range-slider::-moz-range-thumb {
  width: 2px;
  height: 100%;
  background: transparent;
  border: none;
  border-radius: 0;
  cursor: col-resize;
  transition: all 0.2s ease;
}

.range-slider::-moz-range-thumb:hover {
  background: rgba(255, 255, 255, 0);
  width: 6px;
}

.range-slider:disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
