<script lang="ts" setup>
import { ref, watch } from 'vue'

interface AxisConfig {
  min?: number
  max?: number
  step?: number
  label?: string
  formatValue?: (val: number) => string
  precision?: number
}

const props = defineProps<{
  label?: string
  xConfig?: AxisConfig
  yConfig?: AxisConfig
  zConfig?: AxisConfig
}>()

const x = defineModel('x', { required: false, default: 0 })
const y = defineModel('y', { required: false, default: 0 })
const z = defineModel('z', { required: false, default: 0 })

// Dragging state
const isDragging = ref<'x' | 'y' | 'z' | undefined>()
const dragStartX = ref(0)
const dragStartValue = ref(0)

function postProcessValue(val: number, config?: AxisConfig): string | undefined {
  if (config?.formatValue) {
    return config.formatValue(val)
  }

  if (config?.precision) {
    return val.toFixed(config.precision)
  }

  return val.toString()
}

const xNormalized = ref(postProcessValue(x.value, props.xConfig))
const yNormalized = ref(postProcessValue(y.value, props.yConfig))
const zNormalized = ref(postProcessValue(z.value, props.zConfig))

watch(x, () => xNormalized.value = postProcessValue(x.value, props.xConfig))
watch(y, () => yNormalized.value = postProcessValue(y.value, props.yConfig))
watch(z, () => zNormalized.value = postProcessValue(z.value, props.zConfig))

function handleChange(axis: 'x' | 'y' | 'z', event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number.parseFloat(input.value)

  if (Number.isNaN(value))
    return

  updateValue(axis, value)
}

function updateValue(axis: 'x' | 'y' | 'z', value: number) {
  const config = axis === 'x' ? props.xConfig : axis === 'y' ? props.yConfig : props.zConfig

  // Apply min/max constraints
  if (config?.min !== undefined)
    value = Math.max(config.min, value)
  if (config?.max !== undefined)
    value = Math.min(config.max, value)

  switch (axis) {
    case 'x':
      x.value = value
      xNormalized.value = postProcessValue(value, props.xConfig) || String(value)
      break
    case 'y':
      y.value = value
      yNormalized.value = postProcessValue(value, props.yConfig) || String(value)
      break
    case 'z':
      z.value = value
      zNormalized.value = postProcessValue(value, props.zConfig) || String(value)
      break
  }
}

function startDrag(axis: 'x' | 'y' | 'z', event: MouseEvent) {
  event.preventDefault()
  isDragging.value = axis
  dragStartX.value = event.clientX

  const currentValue = axis === 'x'
    ? x.value
    : axis === 'y'
      ? y.value
      : z.value

  dragStartValue.value = currentValue

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(event: MouseEvent) {
  if (!isDragging.value)
    return

  const deltaX = event.clientX - dragStartX.value
  const config = isDragging.value === 'x'
    ? props.xConfig
    : isDragging.value === 'y' ? props.yConfig : props.zConfig

  const sensitivity = config?.step || 0.01
  const newValue = dragStartValue.value + (deltaX * sensitivity)

  updateValue(isDragging.value, newValue)
}

function stopDrag() {
  isDragging.value = undefined

  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
</script>

<template>
  <div>
    <slot name="label">
      <span text-nowrap text-xs>{{ props.label || 'Point' }}</span>
    </slot>
  </div>
  <div />
  <label
    h-fit w-full inline-flex items-center rounded-md px="1.5" py="0.5"
    :class="[isDragging === 'x' ? 'bg-red-100/50 dark:bg-red-900/50' : 'bg-neutral-100 dark:bg-neutral-900']"
    transition="colors duration-200 ease-in-out"
  >
    <span h-fit inline-flex items-center text="[12px]" gap-1>
      <span
        cursor-col-resize select-none text-red-500
        @mousedown="(e) => startDrag('x', e)"
      >|</span>
      <input
        :value="xNormalized"
        type="number"
        :min="props.xConfig?.min"
        :max="props.xConfig?.max"
        :step="0.0001"
        max-w-4lh w-full appearance-none bg-transparent text-right font-mono outline-none
        class="[&::-webkit-inner-spin-button]:(m-0 appearance-none)"
        @change="(e) => handleChange('x', e)"
      >
    </span>
  </label>
  <label
    h-fit inline-flex items-center rounded-md px="1.5" py="0.5"
    :class="[isDragging === 'y' ? 'bg-blue-100/50 dark:bg-blue-900/50' : 'bg-neutral-100 dark:bg-neutral-900']"
    transition="colors duration-200 ease-in-out"
  >
    <span h-fit inline-flex items-center text="[12px]" gap-1>
      <span
        cursor-col-resize select-none text-blue-500
        @mousedown="(e) => startDrag('y', e)"
      >|</span>
      <input
        :value="yNormalized"
        type="number"
        :min="props.yConfig?.min"
        :max="props.yConfig?.max"
        :step="0.0001"
        max-w-4lh w-full appearance-none bg-transparent text-right font-mono outline-none
        class="[&::-webkit-inner-spin-button]:(m-0 appearance-none)"
        @change="(e) => handleChange('y', e)"
      >
    </span>
  </label>
  <label
    h-fit inline-flex items-center rounded-md px="1.5" py="0.5"
    :class="[isDragging === 'z' ? 'bg-green-100/50 dark:bg-green-900/50' : 'bg-neutral-100 dark:bg-neutral-900']"
    transition="colors duration-200 ease-in-out"
  >
    <span h-fit inline-flex items-center text="[12px]" gap-1>
      <span
        cursor-col-resize select-none text-green-500
        @mousedown="(e) => startDrag('z', e)"
      >|</span>
      <input
        :value="zNormalized"
        type="number"
        :min="props.zConfig?.min"
        :max="props.zConfig?.max"
        :step="0.0001"
        max-w-4lh w-full appearance-none bg-transparent text-right font-mono outline-none
        class="[&::-webkit-inner-spin-button]:(m-0 appearance-none)"
        @change="(e) => handleChange('z', e)"
      >
    </span>
  </label>
</template>
