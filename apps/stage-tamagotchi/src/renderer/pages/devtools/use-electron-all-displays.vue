<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { computed } from 'vue'

import { useElectronAllDisplays, useElectronMouse } from '../../composables/electron-vueuse'

const allDisplays = useElectronAllDisplays()
const { x: cursorX, y: cursorY } = useElectronMouse()

const windowSize = useWindowSize()

const displayBounds = computed(() => {
  if (!allDisplays.value.length)
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const display of allDisplays.value) {
    minX = Math.min(minX, display.bounds.x)
    minY = Math.min(minY, display.bounds.y)
    maxX = Math.max(maxX, display.bounds.x + display.bounds.width)
    maxY = Math.max(maxY, display.bounds.y + display.bounds.height)
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
})

// Responsive scale factor based on available window/container space
const scale = computed(() => {
  const { width: totalWidth, height: totalHeight } = displayBounds.value

  if (totalWidth === 0 || totalHeight === 0)
    return 0.2

  // Use window size with some padding for responsive scaling
  const padding = 100
  const availableWidth = windowSize.width.value - padding
  const availableHeight = windowSize.height.value - padding

  // Calculate scale to fit within available space
  const scaleX = availableWidth / totalWidth
  const scaleY = availableHeight / totalHeight

  // Use the smaller scale to ensure everything fits, with a max scale of 0.3
  return Math.min(scaleX, scaleY, 0.3)
})

// Transform display coordinates
function transformDisplay(display: any) {
  const { minX, minY } = displayBounds.value
  return {
    x: (display.bounds.x - minX) * scale.value,
    y: (display.bounds.y - minY) * scale.value,
    width: display.bounds.width * scale.value,
    height: display.bounds.height * scale.value,
  }
}

// Transform cursor coordinates
const transformedCursor = computed(() => {
  const { minX, minY } = displayBounds.value
  return {
    x: (cursorX.value - minX) * scale.value,
    y: (cursorY.value - minY) * scale.value,
  }
})

// Calculate container dimensions
const containerDimensions = computed(() => {
  const { width, height } = displayBounds.value
  return {
    width: width * scale.value,
    height: height * scale.value,
  }
})
</script>

<template>
  <div>
    <div
      class="relative"
      :style="{
        width: `${containerDimensions.width}px`,
        height: `${containerDimensions.height}px`,
      }"
    >
      <div
        v-for="display in allDisplays"
        :key="display.id"
        class="absolute box-border border-2 border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-950/50"
        :style="{
          left: `${transformDisplay(display).x}px`,
          top: `${transformDisplay(display).y}px`,
          width: `${transformDisplay(display).width}px`,
          height: `${transformDisplay(display).height}px`,
        }"
      >
        <!-- Work area (slightly darker) -->
        <div
          class="absolute bg-neutral-200/50 dark:bg-neutral-800/50"
          :style="{
            left: `${(display.workArea.x - display.bounds.x) * scale}px`,
            top: `${(display.workArea.y - display.bounds.y) * scale}px`,
            width: `${display.workArea.width * scale}px`,
            height: `${display.workArea.height * scale}px`,
          }"
        />

        <div class="pointer-events-none absolute left-2.5 top-2.5 text-xs text-neutral-800 font-medium">
          {{ display.label }}
        </div>
        <div class="pointer-events-none absolute left-2.5 top-7.5 text-[10px] text-neutral-600">
          {{ display.bounds.width }}x{{ display.bounds.height }} @ {{ display.rotation }}°
        </div>
      </div>

      <div
        class="pointer-events-none absolute h-3 w-3 border-2 border-primary-400 rounded-full bg-primary-400 transition-all duration-150 ease-out -ml-1.5 -mt-1.5"
        :style="{
          left: `${transformedCursor.x}px`,
          top: `${transformedCursor.y}px`,
        }"
      >
        <div class="absolute left-3 whitespace-nowrap text-[11px] text-primary-400 font-bold -top-1.25">
          {{ cursorX }}, {{ cursorY }}
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: useElectronAllDisplays
  subtitleKey: tamagotchi.settings.devtools.title
</route>
