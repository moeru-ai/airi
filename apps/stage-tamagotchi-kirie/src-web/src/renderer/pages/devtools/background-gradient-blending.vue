<script setup lang="ts">
import { useThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { colorFromElement } from '@proj-airi/stage-ui/libs'
import { BasicInputFile } from '@proj-airi/ui'
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

import defaultBackgroundImage from '../../assets/backgrounds/fairy-forest.e17cbc2774.ko-fi.com.avif'
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

// Theme color integration
const { updateThemeColor } = useThemeColor(() => topBar.value)

async function refreshColors() {
  if (!imageRef.value || images.value.length === 0) {
    return
  }

  try {
    isCapturing.value = true

    if (imageRef.value instanceof HTMLImageElement && !imageRef.value.complete) {
      await new Promise<void>((resolve, reject) => {
        imageRef.value?.addEventListener('load', () => resolve(), { once: true })
        imageRef.value?.addEventListener('error', () => reject(new Error('Image failed to load')), { once: true })
      })
    }

    const result = await colorFromElement(imageRef.value, {
      mode: 'both',
      vibrant: {
        imageSource: images.value[0],
        sampleTopRatio: 0.2,
      },
      html2canvas: {
        region: {
          x: 0,
          y: 0,
          width: imageRef.value.offsetWidth,
          height: 100,
        },
        sampleHeight: 20,
        sampleStride: 10,
        scale: 0.5,
        backgroundColor: null,
        allowTaint: true,
        useCORS: true,
      },
    })

    extractedColors.value = result.vibrant?.palette ?? []
    dominantColor.value = result.vibrant?.dominant ?? ''
    topEdgeColors.value = result.html2canvas?.average ?? ''

    if (canvasRef.value && result.html2canvas?.canvas) {
      const ctx = canvasRef.value.getContext('2d')
      if (ctx) {
        canvasRef.value.width = result.html2canvas.canvas.width
        canvasRef.value.height = result.html2canvas.canvas.height
        ctx.drawImage(result.html2canvas.canvas, 0, 0)
      }
    }

    await updateThemeColor()
  }
  catch (error) {
    console.error('Color extraction failed:', error)
  }
  finally {
    isCapturing.value = false
  }
}

// Auto-extract colors on mount
onMounted(async () => {
  await nextTick()
  await refreshColors()
})

watch(images, async () => {
  await nextTick()
  await refreshColors()
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
</style>
