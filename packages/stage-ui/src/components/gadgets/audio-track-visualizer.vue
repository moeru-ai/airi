<script setup lang="ts">
import WaveSurfer from 'wavesurfer.js'
import SpectrogramPlugin from 'wavesurfer.js/dist/plugins/spectrogram.esm.js'
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js'

import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  audioUrl: string | null
  waveColor?: string
  progressColor?: string
  cursorColor?: string
  cursorWidth?: number
  waveformHeight?: number
  spectrogramHeight?: number
  fftSamples?: number
  frequencyMax?: number
  showSpectrogram?: boolean
  showTimeline?: boolean
}>(), {
  waveColor: 'rgba(59, 130, 246, 0.6)',
  progressColor: 'rgba(34, 211, 238, 0.9)',
  cursorColor: '#f59e0b',
  cursorWidth: 2,
  waveformHeight: 128,
  spectrogramHeight: 160,
  fftSamples: 1024,
  frequencyMax: 8000,
  showSpectrogram: true,
  showTimeline: true,
})

const emit = defineEmits<{
  ready: [duration: number]
  play: []
  pause: []
  finish: []
  timeupdate: [currentTime: number]
  seek: [time: number]
}>()

const waveformRef = ref<HTMLDivElement>()
const spectrogramRef = ref<HTMLDivElement>()

const ws = shallowRef<WaveSurfer | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isReady = ref(false)
const isLoading = ref(false)
const zoomLevel = ref(0)

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const INFERNO_COLORMAP = buildInfernoColormap()

function buildInfernoColormap(): number[][] {
  const stops = [
    [0, 0, 4],
    [40, 11, 84],
    [101, 21, 110],
    [159, 42, 99],
    [212, 72, 66],
    [245, 125, 21],
    [250, 193, 39],
    [252, 255, 164],
  ]
  const map: number[][] = []
  for (let i = 0; i < 256; i++) {
    const t = i / 255 * (stops.length - 1)
    const idx = Math.min(Math.floor(t), stops.length - 2)
    const frac = t - idx
    const a = stops[idx]
    const b = stops[idx + 1]
    map.push([
      Math.round(a[0] + (b[0] - a[0]) * frac),
      Math.round(a[1] + (b[1] - a[1]) * frac),
      Math.round(a[2] + (b[2] - a[2]) * frac),
      255,
    ])
  }
  return map
}

function createInstance() {
  if (!waveformRef.value || !props.audioUrl)
    return

  destroyInstance()
  isLoading.value = true
  isReady.value = false

  const plugins: any[] = []

  if (props.showTimeline) {
    plugins.push(
      TimelinePlugin.create({
        height: 20,
        timeInterval: 1,
        primaryLabelInterval: 10,
        secondaryLabelInterval: 5,
        style: {
          fontSize: '11px',
          color: 'rgba(148, 163, 184, 0.8)',
        },
        formatTimeCallback: (seconds: number) => {
          const m = Math.floor(seconds / 60)
          const s = Math.floor(seconds % 60)
          return `${m}:${s.toString().padStart(2, '0')}`
        },
      }),
    )
  }

  if (props.showSpectrogram && spectrogramRef.value) {
    plugins.push(
      SpectrogramPlugin.create({
        container: spectrogramRef.value,
        height: props.spectrogramHeight,
        labels: true,
        labelsColor: 'rgba(148, 163, 184, 0.9)',
        labelsBackground: 'rgba(0, 0, 0, 0.4)',
        fftSamples: props.fftSamples,
        frequencyMin: 0,
        frequencyMax: props.frequencyMax,
        scale: 'mel',
        colorMap: INFERNO_COLORMAP,
        windowFunc: 'hann',
      }),
    )
  }

  const instance = WaveSurfer.create({
    container: waveformRef.value,
    waveColor: props.waveColor,
    progressColor: props.progressColor,
    cursorColor: props.cursorColor,
    cursorWidth: props.cursorWidth,
    height: props.waveformHeight,
    normalize: true,
    interact: true,
    dragToSeek: true,
    hideScrollbar: false,
    autoScroll: true,
    autoCenter: true,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    url: props.audioUrl,
    plugins,
  })

  instance.on('ready', (dur: number) => {
    duration.value = dur
    isReady.value = true
    isLoading.value = false
    emit('ready', dur)
  })

  instance.on('play', () => {
    isPlaying.value = true
    emit('play')
  })

  instance.on('pause', () => {
    isPlaying.value = false
    emit('pause')
  })

  instance.on('finish', () => {
    isPlaying.value = false
    emit('finish')
  })

  instance.on('timeupdate', (time: number) => {
    currentTime.value = time
    emit('timeupdate', time)
  })

  instance.on('interaction', (time: number) => {
    emit('seek', time)
  })

  instance.on('error', (err: Error) => {
    console.error('[AudioTrackVisualizer] WaveSurfer error:', err)
    isLoading.value = false
  })

  ws.value = instance
}

function destroyInstance() {
  if (ws.value) {
    ws.value.destroy()
    ws.value = null
  }
  isPlaying.value = false
  currentTime.value = 0
  duration.value = 0
  isReady.value = false
  zoomLevel.value = 0
}

function play() {
  ws.value?.play()
}

function pause() {
  ws.value?.pause()
}

function playPause() {
  ws.value?.playPause()
}

function stop() {
  ws.value?.stop()
}

function seekTo(time: number) {
  ws.value?.seekTo(time)
}

function zoom(pxPerSec: number) {
  ws.value?.zoom(pxPerSec)
  zoomLevel.value = pxPerSec
}

function zoomIn() {
  const next = Math.min(zoomLevel.value + 20, 500)
  zoom(next)
}

function zoomOut() {
  const next = Math.max(zoomLevel.value - 20, 0)
  zoom(next)
}

watch(() => props.audioUrl, (newUrl) => {
  if (newUrl)
    createInstance()
  else
    destroyInstance()
})

onMounted(() => {
  if (props.audioUrl)
    createInstance()
})

onBeforeUnmount(() => {
  destroyInstance()
})

defineExpose({
  play,
  pause,
  playPause,
  stop,
  seekTo,
  zoom,
  zoomIn,
  zoomOut,
  isPlaying,
  currentTime,
  duration,
  isReady,
})
</script>

<template>
  <div
    :class="[
      'flex flex-col gap-0',
      'overflow-hidden rounded-lg',
      'border border-neutral-200 dark:border-neutral-700/50',
      'bg-neutral-50 dark:bg-neutral-900/80',
    ]"
  >
    <!-- Loading overlay -->
    <div
      v-if="isLoading"
      :class="[
        'flex items-center justify-center gap-2 py-8',
        'text-sm text-neutral-400',
      ]"
    >
      <div class="i-svg-spinners:ring-resize text-lg" />
      <span>Loading audio...</span>
    </div>

    <!-- Waveform -->
    <div
      ref="waveformRef"
      :class="[
        'w-full',
        isLoading ? 'hidden' : '',
      ]"
    />

    <!-- Spectrogram -->
    <div
      v-if="showSpectrogram"
      ref="spectrogramRef"
      :class="[
        'w-full',
        isLoading ? 'hidden' : '',
      ]"
    />

    <!-- Controls bar -->
    <div
      v-if="isReady"
      :class="[
        'flex items-center gap-3 px-3 py-2',
        'border-t border-neutral-200 dark:border-neutral-700/50',
        'bg-neutral-100/80 dark:bg-neutral-800/60',
      ]"
    >
      <!-- Play/Pause -->
      <button
        :class="[
          'flex items-center justify-center',
          'h-8 w-8 rounded-full',
          'bg-primary-500 text-white',
          'transition-all hover:bg-primary-600 active:scale-95',
        ]"
        @click="playPause"
      >
        <div
          :class="isPlaying
            ? 'i-solar:pause-bold text-sm'
            : 'i-solar:play-bold text-sm ml-0.5'"
        />
      </button>

      <!-- Stop -->
      <button
        :class="[
          'flex items-center justify-center',
          'h-7 w-7 rounded-md',
          'text-neutral-500 dark:text-neutral-400',
          'transition-colors hover:text-neutral-700 dark:hover:text-neutral-200',
        ]"
        @click="stop"
      >
        <div class="i-solar:stop-bold text-sm" />
      </button>

      <!-- Time display -->
      <div :class="['text-xs text-neutral-500 font-mono dark:text-neutral-400', 'min-w-24 select-none']">
        {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
      </div>

      <div class="flex-1" />

      <!-- Zoom controls -->
      <div :class="['flex items-center gap-1']">
        <button
          :class="[
            'flex items-center justify-center',
            'h-6 w-6 rounded',
            'text-neutral-400 dark:text-neutral-500',
            'transition-colors hover:text-neutral-600 dark:hover:text-neutral-300',
          ]"
          title="Zoom out"
          @click="zoomOut"
        >
          <div class="i-solar:magnifer-zoom-out-linear text-sm" />
        </button>
        <button
          :class="[
            'flex items-center justify-center',
            'h-6 w-6 rounded',
            'text-neutral-400 dark:text-neutral-500',
            'transition-colors hover:text-neutral-600 dark:hover:text-neutral-300',
          ]"
          title="Zoom in"
          @click="zoomIn"
        >
          <div class="i-solar:magnifer-zoom-in-linear text-sm" />
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="!audioUrl"
      :class="['flex items-center justify-center gap-2 py-8', 'text-sm text-neutral-400']"
    >
      <div class="i-solar:soundwave-bold-duotone" />
      <span>No audio loaded</span>
    </div>
  </div>
</template>
