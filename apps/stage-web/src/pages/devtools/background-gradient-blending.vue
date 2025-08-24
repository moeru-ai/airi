<script setup lang="ts">
import type { Color } from 'culori'

import html2canvas from 'html2canvas'

import { BasicInputFile } from '@proj-airi/ui'
import { average } from 'culori'
import { Vibrant } from 'node-vibrant/browser'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

import defaultBackgroundImage from '../../assets/backgrounds/fairy-forest.e17cbc2774.ko-fi.com.avif'

import { useThemeColor } from '../../composables/theme-color'

// Reactive state
const isCapturing = ref(false)
const extractedColors = ref<string[]>([])
const dominantColor = ref('')
const topEdgeColors = ref('')

const imageCleanups = ref<Array<() => void>>([])
const imageFiles = ref<File[]>([])
const images = computed(() => {
  if (imageFiles.value.length === 0)
    return [defaultBackgroundImage]

  return imageFiles.value.map((file) => {
    const url = URL.createObjectURL(file)
    imageCleanups.value.push(() => URL.revokeObjectURL(url))

    return url
  })
})

const mode = ref<'vibrant' | 'html2canvas'>('vibrant')

// Template refs
const imageRef = useTemplateRef<HTMLDivElement>('imageRef')
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvas')

// Theme color integration
const { updateThemeColor } = useThemeColor(() => dominantColor.value)

// Computed gradient for top bar blending
const topBar = computed(() => {
  if (mode.value === 'vibrant') {
    return dominantColor.value
  }
  else if (mode.value === 'html2canvas') {
    return topEdgeColors.value
  }

  return ''
})

// Color extraction from image
async function extractColorsFromImage() {
  if (images.value.length === 0) {
    return
  }

  try {
    isCapturing.value = true

    // Extract colors using Vibrant
    const vibrant = new Vibrant(images.value[0])
    const palette = await vibrant.getPalette()

    const colors = Object.values(palette)
      .map(color => color?.hex)
      .filter((color): color is string => typeof color === 'string')

    extractedColors.value = colors
    dominantColor.value = palette.Vibrant?.hex || palette.DarkVibrant?.hex || colors[0]

    // Update PWA theme color
    await updateThemeColor()
  }
  catch (error) {
    console.error('Color extraction failed:', error)
  }
  finally {
    isCapturing.value = false
  }
}

// Capture top edge colors using html2canvas
async function captureTopEdgeColors() {
  if (!imageRef.value)
    return

  try {
    isCapturing.value = true

    // Capture the background element
    const canvas = await html2canvas(imageRef.value, {
      allowTaint: true,
      useCORS: true,
      backgroundColor: null,
      scale: 0.5, // Reduce quality for performance
      height: 100, // Only capture top portion
      width: imageRef.value.offsetWidth,
      logging: false,
    })

    // Display captured canvas for debugging
    if (canvasRef.value) {
      const ctx = canvasRef.value.getContext('2d')
      if (ctx) {
        canvasRef.value.width = canvas.width
        canvasRef.value.height = canvas.height
        ctx.drawImage(canvas, 0, 0)
      }
    }

    // Sample colors from top edge
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, canvas.width, 20) // Top 20px
      const colors: Color[] = []

      // Sample every 10th pixel to get representative colors
      for (let i = 0; i < imageData.data.length; i += 40) { // RGBA = 4 bytes, sample every 10 pixels
        const r = imageData.data[i]
        const g = imageData.data[i + 1]
        const b = imageData.data[i + 2]
        const a = imageData.data[i + 3]

        if (a > 0) { // Skip transparent pixels
          colors.push({ mode: 'rgb', r, g, b })
        }
      }

      if (colors.length > 0) {
        const c = average(colors as [Color, ...Color[]])
        topEdgeColors.value = `rgb(${c.r}, ${c.g}, ${c.b})`
      }
    }
  }
  catch (error) {
    console.error('Canvas capture failed:', error)
  }
  finally {
    isCapturing.value = false
  }
}

// Auto-extract colors on mount
onMounted(async () => {
  await nextTick()
  await extractColorsFromImage()
  await captureTopEdgeColors()
})

watch(images, async () => {
  await nextTick()
  await extractColorsFromImage()
  await captureTopEdgeColors()
})

onUnmounted(() => {
  imageCleanups.value.forEach(cleanup => cleanup())
})
</script>

<template>
  <div class="h-full w-full flex flex-col gap-4">
    <div class="relative w-full overflow-hidden rounded-xl">
      <div class="pointer-events-none left-0 right-0 top-0 z-10 flex items-center justify-center backdrop-blur-md" :style="{ background: topBar }">
        <div class="py-4 text-center text-sm text-white font-medium">
          Top Area
        </div>
      </div>

      <div class="transparent-gradient-overlay absolute inset-0 h-[calc((1lh+1rem+1rem)*2)] w-full" :style="{ background: topBar }" />

      <img
        ref="imageRef"
        :src="images[0]"
        class="h-full max-h-[calc(100dvh-28rem)] w-full object-cover"
      >

      <!-- Live2D area placeholder -->
      <div class="absolute inset-0 flex items-center justify-center">
        <BasicInputFile v-model="imageFiles">
          <div class="rounded-xl bg-black bg-opacity-30 px-5 py-4 text-white backdrop-blur-sm">
            Replace Image
          </div>
        </BasicInputFile>
      </div>
    </div>

    <!-- Debug information -->
    <div class="debug-info flex flex-col" bg="neutral-100 dark:neutral-900" rounded-xl>
      <div flex>
        <!-- Extracted colors -->
        <div class="rounded-lg p-4" flex-1>
          <h3 class="mb-1 text-lg" flex items-center gap-2>
            <span>Node Vibrant</span>
            <button
              border-2 border-neutral-300 rounded-xl border-solid px-3 py-1 text-sm font-normal dark:border-neutral-700
              :class="[
                mode === 'vibrant' ? 'bg-neutral-100 dark:bg-neutral-700' : '',
              ]"
              @click="mode = 'vibrant'"
            >
              {{ mode === 'vibrant' ? 'Activated' : 'Active' }}
            </button>
          </h3>
          <div class="color-palette flex flex-wrap gap-2">
            <div
              v-for="color in extractedColors"
              :key="color"
              class="h-12 w-12 cursor-pointer border-2 border-gray-300 rounded rounded-xl transition-transform duration-200 ease-in-out hover:scale-110 dark:border-gray-900"
              :style="{ backgroundColor: color }"
              :title="color"
            />
          </div>
          <p class="mt-2 text-sm">
            Color: <span :style="{ color: dominantColor }">{{ dominantColor }}</span>
          </p>
        </div>
        <div class="rounded-lg p-4" flex-1>
          <h3 class="mb-1 text-lg" flex items-center gap-2>
            <span>html2canvas Top sampling</span>
            <button
              border-2 border-neutral-300 rounded-xl border-solid px-3 py-1 text-sm font-normal dark:border-neutral-700
              :class="[
                mode === 'html2canvas' ? 'bg-neutral-100 dark:bg-neutral-700' : '',
              ]"
              @click="mode = 'html2canvas'"
            >
              {{ mode === 'html2canvas' ? 'Activated' : 'Active' }}
            </button>
          </h3>
          <div class="color-palette flex flex-wrap gap-2">
            <div
              class="color-swatch h-12 w-12 border-2 border-gray-300 rounded rounded-xl dark:border-gray-900"
              :style="{ backgroundColor: topEdgeColors }"
              :title="topEdgeColors"
            />
          </div>
          <p class="mt-2 text-sm">
            Color: <span :style="{ color: topEdgeColors }">{{ topEdgeColors }}</span>
          </p>
        </div>
      </div>
      <div class="rounded-lg p-4" w-full>
        <h3 class="mb-1 text-lg">
          Captured Canvas (Debug)
        </h3>
        <canvas
          ref="canvas"
          class="max-w-full"
          style="max-height: 100px;"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
DO NOT ATTEMPT TO USE backdrop-filter TOGETHER WITH mask-image.

html - Why doesn't blur backdrop-filter work together with mask-image? - Stack Overflow
https://stackoverflow.com/questions/72780266/why-doesnt-blur-backdrop-filter-work-together-with-mask-image
*/
.transparent-gradient-overlay {
  --gradient: linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 50%);
  -webkit-mask-image: var(--gradient);
  mask-image: var(--gradient);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: bottom;
  mask-position: bottom;
}
</style>
