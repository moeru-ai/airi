<script setup lang="ts">
import type { ComputerUseMediaState } from './computer-use-tool-call-view'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/** The now playing state of the desktop. The full form is a small player, and the compact form names the track and its state. */
const props = defineProps<{
  state: ComputerUseMediaState
  compact?: boolean
}>()

const { t } = useI18n()
const KEY = 'tamagotchi.stage.computer-use-tool-call.media'

function clock(seconds: number) {
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

const progress = computed(() => {
  const { duration_seconds: duration, elapsed_seconds: elapsed } = props.state
  return duration && elapsed != null ? Math.min(100, (elapsed / duration) * 100) : undefined
})
const byline = computed(() => [props.state.artist, props.state.album].filter(Boolean).join(' · '))
const playState = computed(() => props.state.is_playing ? t(`${KEY}.playing`) : t(`${KEY}.paused`))
</script>

<template>
  <div v-if="!props.state.present" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
    {{ t(`${KEY}.nothing`) }}
  </div>
  <div v-else-if="props.compact" :class="['min-w-0 flex flex-col text-[11px]']">
    <span :class="['truncate font-semibold', 'text-neutral-800 dark:text-neutral-100']">{{ props.state.title }}</span>
    <span :class="['truncate', 'text-neutral-500 dark:text-neutral-400']">{{ playState }}<template v-if="byline"> · {{ byline }}</template></span>
  </div>
  <div v-else :class="['flex items-center gap-2.5']">
    <span
      :class="['size-13 shrink-0 flex items-center justify-center rounded-lg text-2xl text-white', 'bg-gradient-to-br from-pink-400 to-violet-500']"
      aria-hidden="true"
    >
      <span :class="['i-mingcute:music-2-fill']" />
    </span>
    <div :class="['min-w-0 flex flex-1 flex-col gap-0.5']">
      <span :class="['truncate text-[13px] font-semibold', 'text-neutral-800 dark:text-neutral-100']">{{ props.state.title }}</span>
      <span v-if="byline" :class="['truncate text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ byline }}</span>
      <div v-if="progress !== undefined" :class="['h-1 overflow-hidden rounded-full', 'bg-neutral-200 dark:bg-neutral-700']">
        <div :class="['h-full bg-primary-500']" :style="{ width: `${progress}%` }" />
      </div>
      <span :class="['flex flex-wrap justify-between gap-x-2 text-[10px] tabular-nums', 'text-neutral-400 dark:text-neutral-500']">
        <span v-if="props.state.elapsed_seconds != null">{{ clock(props.state.elapsed_seconds) }}</span>
        <span>
          {{ playState }} · {{ t(`${KEY}.rate`, { rate: props.state.playback_rate }) }}
          <template v-if="props.state.source_bundle_id"> · {{ props.state.source_bundle_id }}</template>
          <template v-if="props.state.is_liked"> · {{ t(`${KEY}.liked`) }}</template>
        </span>
        <span v-if="props.state.duration_seconds != null">{{ clock(props.state.duration_seconds) }}</span>
      </span>
    </div>
  </div>
</template>
