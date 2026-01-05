<script setup lang="ts">
import type { PNGtuberLoadedModel } from '../../utils/pngtuber-zip-loader'

import { useTheme } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import Screen from '../misc/Screen.vue'

import { usePNGtuberStore } from '../../stores/pngtuber'
import { loadPNGtuberFromZip } from '../../utils/pngtuber-zip-loader'

const props = withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string
  paused?: boolean
  mouthOpenSize?: number
  focusAt?: { x: number, y: number }
}>(), {
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  mouthOpenSize: 0,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const canvasRef = ref<HTMLCanvasElement>()
const containerRef = ref<HTMLDivElement>()
useTheme()

const pngtuberStore = usePNGtuberStore()
const {
  manifest,
  currentEmotion,
  position,
  scale,
  mouthOpenThreshold,
} = storeToRefs(pngtuberStore)

// Image cache
const imageCache = ref<Map<string, HTMLImageElement>>(new Map())
const imageUrls = ref<Map<string, string>>(new Map())
const loadedModel = ref<PNGtuberLoadedModel | null>(null)

// Blink state
const blinkState = ref({
  isBlinking: false,
  blinkTimer: 0,
  nextBlinkTime: 3000 + Math.random() * 5000,
})

// Mouth pac animation state (for lip sync during speech)
const mouthPacState = ref({
  isMouthOpen: false,
  pacTimer: 0,
  nextPacTime: 0,
})

// Animation frame ID
let animationFrameId: number | null = null
let lastTime = 0

// Computed current sprite based on state
const currentSprite = computed(() => {
  if (!manifest.value)
    return null

  const emotion = currentEmotion.value
  const emotionData = emotion && manifest.value.emotions?.[emotion]

  // Use emotion sprite if available, otherwise use idle
  const baseSprite = (emotionData && typeof emotionData !== 'string' ? emotionData.default : null) ?? manifest.value.idle.default
  const blinkSprite = (emotionData && typeof emotionData !== 'string' ? emotionData.blink : null) ?? manifest.value.idle.blink

  return {
    base: baseSprite,
    blink: blinkSprite,
    mouthClosed: manifest.value.mouth?.closed,
    mouthOpen: manifest.value.mouth?.open,
    mouthA: manifest.value.mouth?.a,
    mouthE: manifest.value.mouth?.e,
    mouthI: manifest.value.mouth?.i,
    mouthO: manifest.value.mouth?.o,
    mouthU: manifest.value.mouth?.u,
  }
})

// Get mouth sprite based on mouth open size with pac animation
function getMouthSprite(): string | null {
  if (!currentSprite.value)
    return null

  const { mouthOpen, mouthClosed } = currentSprite.value

  // Use configurable threshold from store (default: 0.15 for more responsive lip sync)
  const threshold = mouthOpenThreshold.value ?? 0.15
  
  // If speaking (mouthOpenSize > threshold), animate mouth pac
  if (props.mouthOpenSize > threshold) {
    // Use pac animation state for natural lip sync
    return mouthPacState.value.isMouthOpen ? (mouthOpen ?? null) : (mouthClosed ?? null)
  }

  // Not speaking, keep mouth closed
  return mouthClosed ?? null
}

// Load image and cache it
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src)
    return null

  // Check if we have a blob URL for this image (from ZIP)
  const blobUrl = imageUrls.value.get(src)
  const fullSrc = blobUrl || src

  if (imageCache.value.has(src)) {
    return imageCache.value.get(src)!
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      imageCache.value.set(src, img)
      resolve(img)
    }
    img.onerror = () => {
      console.error(`Failed to load PNGtuber sprite: ${fullSrc}`)
      resolve(null)
    }
    img.src = fullSrc
  })
}

// Preload all images from manifest
async function preloadImages() {
  if (!manifest.value)
    return

  const imagesToLoad: string[] = []

  // Idle images
  imagesToLoad.push(manifest.value.idle.default)
  if (manifest.value.idle.blink)
    imagesToLoad.push(manifest.value.idle.blink)

  // Mouth images
  if (manifest.value.mouth) {
    const mouth = manifest.value.mouth
    if (mouth.closed)
      imagesToLoad.push(mouth.closed)
    if (mouth.open)
      imagesToLoad.push(mouth.open)
    if (mouth.a)
      imagesToLoad.push(mouth.a)
    if (mouth.e)
      imagesToLoad.push(mouth.e)
    if (mouth.i)
      imagesToLoad.push(mouth.i)
    if (mouth.o)
      imagesToLoad.push(mouth.o)
    if (mouth.u)
      imagesToLoad.push(mouth.u)
  }

  // Emotion images
  if (manifest.value.emotions) {
    for (const emotion of Object.values(manifest.value.emotions)) {
      imagesToLoad.push(emotion.default)
      if (emotion.blink)
        imagesToLoad.push(emotion.blink)
    }
  }

  await Promise.all(imagesToLoad.map(loadImage))
}

// Render frame
async function render(timestamp: number) {
  if (props.paused) {
    animationFrameId = requestAnimationFrame(render)
    return
  }

  const canvas = canvasRef.value
  if (!canvas)
    return

  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const deltaTime = timestamp - lastTime
  lastTime = timestamp

  // Update blink state - only schedule a new blink if not already blinking
  if (!blinkState.value.isBlinking) {
    blinkState.value.blinkTimer += deltaTime
    if (blinkState.value.blinkTimer >= blinkState.value.nextBlinkTime) {
      blinkState.value.isBlinking = true
      setTimeout(() => {
        blinkState.value.isBlinking = false
        blinkState.value.blinkTimer = 0
        blinkState.value.nextBlinkTime = 3000 + Math.random() * 5000
      }, 150)
    }
  }

  // Update mouth pac animation during speech
  const threshold = mouthOpenThreshold.value ?? 0.15
  if (props.mouthOpenSize > threshold) {
    // Speaking: animate mouth pac based on mouthOpenSize
    // Higher mouthOpenSize = faster pac (more frequent open/close)
    // Base interval: 100-200ms, adjusted by mouthOpenSize (0.15-1.0 range)
    const baseInterval = 150 // ms
    const speedMultiplier = Math.max(0.5, Math.min(2.0, props.mouthOpenSize / threshold))
    const pacInterval = baseInterval / speedMultiplier

    mouthPacState.value.pacTimer += deltaTime
    if (mouthPacState.value.pacTimer >= pacInterval) {
      mouthPacState.value.isMouthOpen = !mouthPacState.value.isMouthOpen
      mouthPacState.value.pacTimer = 0
    }
  }
  else {
    // Not speaking: reset mouth pac state
    mouthPacState.value.isMouthOpen = false
    mouthPacState.value.pacTimer = 0
  }

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!currentSprite.value)
    return

  // Determine which base sprite to show
  const baseSpriteSrc = blinkState.value.isBlinking && currentSprite.value.blink
    ? currentSprite.value.blink
    : currentSprite.value.base

  const baseImage = await loadImage(baseSpriteSrc)
  if (!baseImage)
    return

  // Calculate position and scale
  const scaleValue = scale.value
  const imgWidth = baseImage.width * scaleValue
  const imgHeight = baseImage.height * scaleValue
  const x = (canvas.width - imgWidth) / 2 + position.value.x
  const y = (canvas.height - imgHeight) / 2 + position.value.y

  // Draw base sprite
  ctx.drawImage(baseImage, x, y, imgWidth, imgHeight)

  // Draw mouth overlay if available
  const mouthSpriteSrc = getMouthSprite()
  if (mouthSpriteSrc) {
    const mouthImage = await loadImage(mouthSpriteSrc)
    if (mouthImage) {
      ctx.drawImage(mouthImage, x, y, imgWidth, imgHeight)
    }
  }

  animationFrameId = requestAnimationFrame(render)
}

// Clean up previous model resources
function cleanupModel() {
  // Revoke manifest blob URL
  if (loadedModel.value?.manifestUrl) {
    URL.revokeObjectURL(loadedModel.value.manifestUrl)
  }
  // Revoke all image blob URLs
  for (const url of imageUrls.value.values()) {
    URL.revokeObjectURL(url)
  }
  imageUrls.value.clear()
  imageCache.value.clear()
  loadedModel.value = null
}

// Load model from URL (blob URL from ZIP file)
async function loadModel() {
  if (!props.modelSrc) {
    componentState.value = 'mounted'
    return
  }

  componentState.value = 'loading'

  try {
    // Clean up previous model
    cleanupModel()

    // Fetch the ZIP file from blob URL
    const response = await fetch(props.modelSrc)
    if (!response.ok) {
      throw new Error(`Failed to fetch PNGtuber ZIP: ${response.statusText}`)
    }

    const zipBlob = await response.blob()

    // Load model from ZIP
    const model = await loadPNGtuberFromZip(zipBlob)
    loadedModel.value = model
    manifest.value = model.manifest

    // Create blob URLs for all images
    for (const [path, blob] of model.images) {
      const url = URL.createObjectURL(blob)
      imageUrls.value.set(path, url)
    }

    // Preload all images
    await preloadImages()

    componentState.value = 'mounted'
  }
  catch (error) {
    console.error('Failed to load PNGtuber model:', error)
    componentState.value = 'mounted'
  }
}

// Handle canvas resize
const handleResize = useDebounceFn(() => {
  if (!canvasRef.value || !containerRef.value)
    return

  const rect = containerRef.value.getBoundingClientRect()
  canvasRef.value.width = rect.width * 2
  canvasRef.value.height = rect.height * 2
}, 100)

// Start animation loop
function startAnimation() {
  if (animationFrameId)
    return

  lastTime = performance.now()
  animationFrameId = requestAnimationFrame(render)
}

// Stop animation loop
function stopAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

watch(() => props.modelSrc, loadModel, { immediate: true })
watch(() => props.paused, (paused) => {
  if (paused) {
    stopAnimation()
  }
  else {
    startAnimation()
  }
})

onMounted(() => {
  handleResize()
  startAnimation()

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  stopAnimation()
  cleanupModel()
  window.removeEventListener('resize', handleResize)
})

function canvasElement() {
  return canvasRef.value
}

defineExpose({
  canvasElement,
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <div
      ref="containerRef"
      :class="[
        'relative',
        'w-full',
        'h-full',
        'overflow-hidden',
      ]"
      :style="{ width: `${width}px`, height: `${height}px` }"
    >
      <canvas
        ref="canvasRef"
        :class="[
          'w-full',
          'h-full',
          'object-contain',
        ]"
      />
    </div>
  </Screen>
</template>
