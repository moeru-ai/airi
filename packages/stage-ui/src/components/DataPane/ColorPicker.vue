<script lang="ts" setup>
import type { DataType, Globals } from 'csstype'

import { useEventListener, useMouseInElement } from '@vueuse/core'
import { convertHsvToRgb } from 'culori'
import { computed, onMounted, ref } from 'vue'

const hue = ref(0)
const modelValue = defineModel<Globals | DataType.Color>({ required: false })

const showPicker = ref(false)
const colorMapRef = ref<HTMLDivElement>()

const { elementX, elementY } = useMouseInElement(colorMapRef)

// Track dragging state
const isDragging = ref(false)
const pickerX = ref(0)
const pickerY = ref(0)

// Calculate color based on picker position
const currentColor = computed(() => {
  if (!colorMapRef.value)
    return modelValue.value

  const rect = colorMapRef.value.getBoundingClientRect()
  const x = Math.max(0, Math.min(pickerX.value, rect.width))
  const y = Math.max(0, Math.min(pickerY.value, rect.height))

  const saturation = (x) / rect.width * 100
  const value = (rect.height - y) / rect.height * 100

  const rgb = convertHsvToRgb({ h: hue.value, s: saturation, v: value })
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
})

// Enhanced mousedown to hide cursor globally
function handleMouseDown(event: MouseEvent) {
  isDragging.value = true
  updatePickerPosition()
  event.preventDefault()
}

function updatePickerPosition() {
  if (!colorMapRef.value)
    return

  const rect = colorMapRef.value.getBoundingClientRect()

  pickerX.value = Math.max(0, Math.min(elementX.value, rect.width))
  pickerY.value = Math.max(0, Math.min(elementY.value, rect.height))
}

function handleMouseMove() {
  if (isDragging.value) {
    updatePickerPosition()
  }
}

function handleGlobalMouseMove(event: MouseEvent) {
  if (isDragging.value) {
    if (colorMapRef.value) {
      const rect = colorMapRef.value.getBoundingClientRect()
      const globalX = event.clientX - rect.left
      const globalY = event.clientY - rect.top

      pickerX.value = Math.max(0, Math.min(globalX, rect.width))
      pickerY.value = Math.max(0, Math.min(globalY, rect.height))

      modelValue.value = currentColor.value as Globals | DataType.Color
    }
  }
}

function handleGlobalMouseUp() {
  if (isDragging.value) {
    handleDragEnd()
  }
}

function handleDragEnd() {
  if (isDragging.value) {
    modelValue.value = currentColor.value as Globals | DataType.Color
    isDragging.value = false
  }
}

onMounted(() => {
  useEventListener('mousemove', handleGlobalMouseMove)
  useEventListener('mouseup', handleGlobalMouseUp)
})
</script>

<template>
  <div h-full w-full>
    <div relative w-full class="data-pane-teleport-wrapper">
      <label>
        <div min-h-5 :style="{ backgroundColor: modelValue }" />
        <input v-model="showPicker" type="checkbox" invisible absolute appearance-none>
      </label>
      <div v-if="showPicker" translate-y="100%" absolute bottom--3 left-0 z-10 h-70 w-90 overflow-hidden rounded-xl>
        <div bg="white dark:neutral-900" h-full w-full p-2>
          <div
            ref="colorMapRef"
            class="color-map"
            :style="{ cursor: isDragging ? 'none' : 'crosshair' }"
            rounded-md
            @mousedown="handleMouseDown"
            @mousemove="handleMouseMove"
          >
            <div
              class="color-picker"
              absolute
              :style="{
                top: `${pickerY - 12}px`,
                left: `${pickerX - 12}px`,
                transform: isDragging ? 'scale(1.2)' : '',
              }"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.color-map::before {
  content: "";
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background-image: linear-gradient(to bottom, transparent, black);
}

.color-map {
  width: 100%;
  height: 100%;
  background-image: linear-gradient(to left, rgb(255, 0, 0), white);
  display: inline-block;
  position: relative;
  overflow: hidden;
  cursor: crosshair;
  user-select: none;
}

.color-picker {
  width: 24px;
  height: 24px;
  display: inline-block;
  position: absolute;
  border-radius: 50%;
  border: 2px solid white;
  pointer-events: none;
  transition: transform 0.15s ease-in-out;
}
</style>
