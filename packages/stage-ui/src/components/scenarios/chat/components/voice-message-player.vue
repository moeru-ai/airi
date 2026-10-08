<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { useObjectUrl } from '@vueuse/core'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** The recording. A Blob gets an object URL for its lifetime. A string is used as the URL, for example a data URL. */
  audio: Blob | string | undefined
}>()

const { t } = useI18n()
const blobUrl = useObjectUrl(computed(() => props.audio instanceof Blob ? props.audio : undefined))
const source = computed(() => typeof props.audio === 'string' ? props.audio : blobUrl.value)
const player = useTemplateRef<HTMLAudioElement>('player')
const playing = shallowRef(false)
const playedSeconds = shallowRef(0)
const durationSeconds = shallowRef(0)

function formatDuration(seconds: number) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function togglePlayback() {
  if (!player.value)
    return
  if (player.value.paused)
    void player.value.play()
  else
    player.value.pause()
}
</script>

<template>
  <div
    data-testid="voice-message-player"
    :class="[
      'max-w-full w-72 h-10 flex items-center gap-1 rounded-xl px-1',
      'bg-neutral-900/5 text-neutral-600 dark:bg-white/8 dark:text-neutral-300',
    ]"
  >
    <audio
      ref="player"
      :src="source"
      preload="metadata"
      :class="['hidden']"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false; playedSeconds = 0"
      @timeupdate="playedSeconds = ($event.target as HTMLAudioElement).currentTime"
      @loadedmetadata="durationSeconds = ($event.target as HTMLAudioElement).duration"
    />
    <BasicButton
      size="unset"
      type="button"
      :aria-label="t(playing ? 'stage.chat.voice-composer.pause' : 'stage.chat.voice-composer.play')"
      :class="['size-8 shrink-0 flex items-center justify-center rounded-full outline-none text-primary-600 hover:bg-neutral-900/10 dark:text-primary-300 dark:hover:bg-white/10']"
      @click="togglePlayback"
    >
      <span :class="[playing ? 'i-solar:pause-bold' : 'i-solar:play-bold', 'size-4']" aria-hidden="true" />
    </BasicButton>
    <div :class="['h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-900/10 dark:bg-white/10']">
      <div :class="['h-full rounded-full bg-primary-500']" :style="{ width: `${durationSeconds ? Math.min(100, playedSeconds / durationSeconds * 100) : 0}%` }" />
    </div>
    <span :class="['shrink-0 px-1 text-xs tabular-nums']">{{ formatDuration(playing || playedSeconds ? playedSeconds : durationSeconds) }}</span>
    <!-- Trailing controls of the host, such as an error mark or a discard button. -->
    <slot name="actions" />
  </div>
</template>
