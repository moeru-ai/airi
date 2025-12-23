<script setup lang="ts">
import type { MediaPipeAssetsConfig, PerceptionState } from '@proj-airi/mediapipe-workshop'

import { createMediaPipeBackend, createMocapEngine, DEFAULT_MEDIAPIPE_ASSETS, drawOverlay, WORKSHOP_NAME } from '@proj-airi/mediapipe-workshop'
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'

const status = ref<'idle' | 'starting' | 'running' | 'error'>('idle')
const errorMessage = ref('')

const videoRef = ref<HTMLVideoElement>()
const canvasRef = ref<HTMLCanvasElement>()
let stream: MediaStream | undefined
let engine: ReturnType<typeof createMocapEngine> | undefined

// config on the page
const config = ref({
  enabled: {
    pose: true,
    hands: true,
    face: true,
  },
  hz: {
    pose: 30,
    hands: 30,
    face: 30,
  },
  maxPeople: 1 as const, // Fixed to 1 for simplicity
})

// MediaPipe assets config
const assets = ref<MediaPipeAssetsConfig>(DEFAULT_MEDIAPIPE_ASSETS)
const latestState = ref<PerceptionState>()

// Snapshot summary of the running state
const summary = computed(() => {
  const enabled = Object.entries(config.value.enabled)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ') || 'none'

  const fps = latestState.value?.quality.fps
  const latency = latestState.value?.quality.latencyMs
  const dropped = latestState.value?.quality.droppedFrames

  return [
    `enabled: ${enabled}`,
    `hz: pose ${config.value.hz.pose}, hands ${config.value.hz.hands}, face ${config.value.hz.face}`,
    fps != null ? `fps ${fps.toFixed(1)}` : null,
    latency != null ? `latency ${latency.toFixed(1)}ms` : null,
    dropped != null ? `dropped ${dropped}` : null,
  ].filter(Boolean).join(' | ')
})

// Start camera and pipeline
async function startCamera() {
  if (status.value === 'starting' || status.value === 'running')
    return

  status.value = 'starting'
  errorMessage.value = ''

  try {
    stop()
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    if (!videoRef.value)
      throw new Error('video element not mounted')

    videoRef.value.srcObject = stream
    await videoRef.value.play()

    status.value = 'running'
    await startPipeline()
  }
  catch (err) {
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : String(err)
    console.error('Failed to start camera or pipeline:', err)
  }
}

async function startPipeline() {
  if (!videoRef.value)
    return
  if (engine)
    return

  const backend = createMediaPipeBackend(toRaw(assets.value))
  engine = createMocapEngine(backend, toRaw(config.value))
  await engine.init()

  engine.start(
    { getFrame: () => videoRef.value as HTMLVideoElement },
    (state) => {
      latestState.value = state

      const canvas = canvasRef.value
      const video = videoRef.value
      if (!canvas || !video)
        return

      const w = video.videoWidth || 640
      const h = video.videoHeight || 480
      if (canvas.width !== w)
        canvas.width = w
      if (canvas.height !== h)
        canvas.height = h

      const ctx = canvas.getContext('2d')
      if (!ctx)
        return

      drawOverlay(ctx, state, config.value.enabled)
    },
    {
      onError: (err) => {
        errorMessage.value = err instanceof Error ? err.message : String(err)
        // Ensure resources are released, but keep the error status visible.
        stop()
        status.value = 'error'
        console.error('Pipeline error:', err)
      },
    },
  )
}

function stopPipeline() {
  engine?.stop()
  engine = undefined
  latestState.value = undefined
}

function stop() {
  canvasRef.value?.getContext('2d')?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  stopPipeline()

  try {
    stream?.getTracks().forEach(t => t.stop())
  }
  catch {}

  stream = undefined

  if (videoRef.value)
    videoRef.value.srcObject = null

  status.value = 'idle'
}

watch(config, (val) => {
  engine?.updateConfig(toRaw(val))
}, { deep: true })

onMounted(() => {
  // Autostart for convenience
  startCamera()
})

onUnmounted(() => {
  stop()
})
</script>

<template>
  <div :class="['p-4', 'space-y-4']">
    <div :class="['text-lg', 'font-600']">
      MediaPipe Workshop Playground
    </div>

    <div :class="['text-xs', 'text-neutral-500', 'break-words']">
      Package: {{ WORKSHOP_NAME }}
    </div>

    <div :class="['grid', 'gap-4', 'lg:grid-cols-2']">
      <div :class="['rounded-2xl', 'border', 'border-neutral-300/40', 'dark:border-neutral-700/40', 'overflow-hidden']">
        <div :class="['relative', 'aspect-video', 'bg-black']">
          <video
            ref="videoRef"
            muted
            playsinline
            :class="['absolute', 'inset-0', 'h-full', 'w-full', 'object-cover', 'opacity-70']"
          />
          <canvas
            ref="canvasRef"
            :class="['absolute', 'inset-0', 'h-full', 'w-full', 'object-cover', 'opacity-70']"
          />

          <div
            :class="[
              'absolute',
              'left-3',
              'top-3',
              'rounded-lg',
              'bg-black/50',
              'px-2',
              'py-1',
              'text-xs',
              'text-white',
              'backdrop-blur',
            ]"
          >
            <div>Status: {{ status }}</div>
            <div v-if="status === 'error'" :class="['text-red-300']">
              {{ errorMessage }}
            </div>
          </div>
        </div>

        <div :class="['flex', 'items-center', 'gap-2', 'p-3', 'border-t', 'border-neutral-200/60', 'dark:border-neutral-700/60']">
          <button
            :class="['rounded-lg', 'bg-primary-500', 'px-3', 'py-2', 'text-sm', 'text-white', 'disabled:bg-neutral-400']"
            :disabled="status === 'starting' || status === 'running'"
            @click="startCamera"
          >
            Start
          </button>
          <button
            :class="['rounded-lg', 'border', 'border-neutral-300/60', 'px-3', 'py-2', 'text-sm', 'dark:border-neutral-700/60']"
            :disabled="status === 'starting' || status === 'idle'"
            @click="stop"
          >
            Stop
          </button>

          <div :class="['ml-auto', 'text-xs', 'text-neutral-500']">
            {{ summary }}
          </div>
        </div>
      </div>

      <div :class="['rounded-2xl', 'border', 'border-neutral-300/40', 'dark:border-neutral-700/40', 'p-3', 'space-y-3']">
        <div :class="['font-600']">
          Config
        </div>

        <div :class="['grid', 'gap-3', 'sm:grid-cols-3']">
          <label :class="['flex', 'items-center', 'gap-2', 'text-sm']">
            <input v-model="config.enabled.pose" type="checkbox">
            Pose
          </label>
          <label :class="['flex', 'items-center', 'gap-2', 'text-sm']">
            <input v-model="config.enabled.hands" type="checkbox">
            Hands
          </label>
          <label :class="['flex', 'items-center', 'gap-2', 'text-sm']">
            <input v-model="config.enabled.face" type="checkbox">
            Face
          </label>
        </div>

        <div :class="['grid', 'gap-3', 'sm:grid-cols-3']">
          <label :class="['space-y-1']">
            <div :class="['text-xs', 'text-neutral-500']">
              Pose Hz
            </div>
            <input v-model.number="config.hz.pose" type="number" min="1" max="60" :class="['w-full', 'rounded-lg', 'border', 'border-neutral-300/60', 'bg-white', 'px-2', 'py-1', 'text-sm', 'dark:bg-neutral-900/60', 'dark:border-neutral-700/60']">
          </label>
          <label :class="['space-y-1']">
            <div :class="['text-xs', 'text-neutral-500']">
              Hands Hz
            </div>
            <input v-model.number="config.hz.hands" type="number" min="1" max="60" :class="['w-full', 'rounded-lg', 'border', 'border-neutral-300/60', 'bg-white', 'px-2', 'py-1', 'text-sm', 'dark:bg-neutral-900/60', 'dark:border-neutral-700/60']">
          </label>
          <label :class="['space-y-1']">
            <div :class="['text-xs', 'text-neutral-500']">
              Face Hz
            </div>
            <input v-model.number="config.hz.face" type="number" min="1" max="60" :class="['w-full', 'rounded-lg', 'border', 'border-neutral-300/60', 'bg-white', 'px-2', 'py-1', 'text-sm', 'dark:bg-neutral-900/60', 'dark:border-neutral-700/60']">
          </label>
        </div>

        <div :class="['text-xs', 'text-neutral-500']">
          Note: `@mediapipe/tasks-vision` runs sync and may block the main thread. This workshop drops frames when busy to keep UI responsive.
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
