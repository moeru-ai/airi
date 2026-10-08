<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { useElementSize, useObjectUrl, useRafFn } from '@vueuse/core'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { drawWaveformBars, MESSAGE_WAVEFORM_BARS, waveformPeaks, waveformSlots } from '../../../../libs/voice/waveform'

const props = withDefaults(defineProps<{
  /** The recording. A Blob gets an object URL for its lifetime. A string is used as the URL, for example a data URL. */
  audio: Blob | string | undefined
  /**
   * `card` paints its own surface, for example above the composer text.
   * `none` leaves the surface to the host, for example a message bubble.
   */
  surface?: 'card' | 'none'
}>(), {
  surface: 'card',
})

/** The decoded recording keeps this many peaks. Each redraw scales them to the bars that fit. */
const ENVELOPE_SIZE = 512
/** The waveform grows with the recording length between these widths, in CSS pixels. */
const MIN_WAVEFORM_WIDTH = 96
const MAX_WAVEFORM_WIDTH = 224
const SEEK_STEP_SECONDS = 1

const { t } = useI18n()
const blobUrl = useObjectUrl(computed(() => props.audio instanceof Blob ? props.audio : undefined))
const source = computed(() => typeof props.audio === 'string' ? props.audio : blobUrl.value)
const player = useTemplateRef<HTMLAudioElement>('player')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const { width, height } = useElementSize(canvas)

const playing = shallowRef(false)
/** Played part of the recording, from 0 to 1. */
const progress = shallowRef(0)
const duration = shallowRef(0)
const envelope = shallowRef<Float32Array>()
const dragging = shallowRef(false)

const waveformWidth = computed(() => `${Math.round(Math.min(MAX_WAVEFORM_WIDTH, Math.max(MIN_WAVEFORM_WIDTH, 56 + duration.value * 14)))}px`)

// Decodes the recording once for its peaks and length. A recording that cannot be decoded draws silence.
watch(() => props.audio, async (audio, _, onCleanup) => {
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  envelope.value = undefined
  duration.value = 0
  progress.value = 0
  if (!audio)
    return
  try {
    const bytes = audio instanceof Blob ? await audio.arrayBuffer() : await (await fetch(audio)).arrayBuffer()
    // An offline context decodes without user activation. 16 kHz is enough for peaks.
    const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes)
    if (cancelled)
      return
    envelope.value = new Float32Array(waveformPeaks(decoded.getChannelData(0), ENVELOPE_SIZE))
    duration.value = decoded.duration
  }
  catch {
    if (!cancelled)
      envelope.value = new Float32Array(0)
  }
}, { immediate: true })

function draw() {
  const element = canvas.value
  if (!element)
    return
  const slots = waveformSlots(width.value, MESSAGE_WAVEFORM_BARS)
  const levels = envelope.value?.length ? waveformPeaks(envelope.value, slots) : Array.from<number>({ length: slots }).fill(0)
  // Bars use the host text color. Played bars are as strong as the text. The rest is faint.
  const color = getComputedStyle(element).color
  drawWaveformBars(element, { width: width.value, height: height.value }, levels, slot => ({ color, alpha: (slot + 0.5) / slots <= progress.value ? 0.9 : 0.3 }), MESSAGE_WAVEFORM_BARS)
}

watch([width, height, envelope, progress], draw)

// `timeupdate` fires about four times per second. Frames keep the played bars moving smoothly.
const frames = useRafFn(() => {
  if (player.value && duration.value && !dragging.value)
    progress.value = Math.min(1, player.value.currentTime / duration.value)
}, { immediate: false })

watch(playing, value => value ? frames.resume() : frames.pause())

function togglePlayback() {
  if (!player.value)
    return
  if (player.value.paused)
    void player.value.play()
  else
    player.value.pause()
}

function seek(fraction: number) {
  progress.value = Math.min(1, Math.max(0, fraction))
  if (player.value && duration.value)
    player.value.currentTime = progress.value * duration.value
}

function seekToPointer(event: PointerEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  seek((event.clientX - bounds.left) / bounds.width)
}

function startDrag(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  seekToPointer(event)
}

function drag(event: PointerEvent) {
  if (dragging.value)
    seekToPointer(event)
}

function endDrag() {
  dragging.value = false
}

function seekByKey(event: KeyboardEvent) {
  if (!duration.value)
    return
  const step = SEEK_STEP_SECONDS / duration.value
  const targets: Record<string, number> = {
    ArrowLeft: progress.value - step,
    ArrowDown: progress.value - step,
    ArrowRight: progress.value + step,
    ArrowUp: progress.value + step,
    Home: 0,
    End: 1,
  }
  if (!(event.key in targets))
    return
  event.preventDefault()
  seek(targets[event.key])
}

function formatTime(seconds: number) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
</script>

<template>
  <div
    data-testid="voice-message-player"
    :class="[
      'flex w-fit max-w-full items-center gap-2',
      props.surface === 'card' && 'h-10 rounded-xl px-1.5 bg-neutral-900/5 text-neutral-700 dark:bg-white/8 dark:text-neutral-200',
    ]"
  >
    <audio
      ref="player"
      :src="source"
      preload="metadata"
      :class="['hidden']"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false; progress = 0"
    />
    <BasicButton
      size="unset"
      type="button"
      :aria-label="t(playing ? 'stage.chat.voice-composer.pause' : 'stage.chat.voice-composer.play')"
      :class="[
        'size-6 shrink-0 flex items-center justify-center rounded-full outline-none',
        'bg-neutral-900/8 hover:bg-neutral-900/14 dark:bg-white/12 dark:hover:bg-white/20',
        'focus-visible:ring-2 focus-visible:ring-primary-300',
      ]"
      @click="togglePlayback"
    >
      <span :class="[playing ? 'i-solar:pause-bold' : 'i-solar:play-bold', 'size-3']" aria-hidden="true" />
    </BasicButton>
    <div
      role="slider"
      tabindex="0"
      data-testid="voice-message-waveform"
      :aria-label="t('stage.chat.voice-message.position')"
      aria-valuemin="0"
      :aria-valuemax="Math.round(duration)"
      :aria-valuenow="Math.round(progress * duration)"
      :aria-valuetext="`${formatTime(progress * duration)} / ${formatTime(duration)}`"
      :style="{ width: waveformWidth }"
      :class="[
        'h-5 min-w-0 shrink cursor-pointer touch-none select-none rounded outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary-300',
      ]"
      @pointerdown="startDrag"
      @pointermove="drag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @keydown="seekByKey"
    >
      <canvas ref="canvas" aria-hidden="true" :class="['block h-full w-full']" />
    </div>
    <!-- Trailing controls of the host, such as an error mark or a discard button. -->
    <slot name="actions" />
  </div>
</template>
