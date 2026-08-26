<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useLive2DMotionPlaybackKeys } from '../../composables/use-live2d-motion-playback-keys'

const props = defineProps<{
  currentTimeMs: number
  disabled?: boolean
  durationMs: number
  playing: boolean
}>()

const emit = defineEmits<{
  end: []
  pause: []
  play: []
  start: []
  stepBackward: [steps: number]
  stepForward: [steps: number]
}>()

const { t } = useI18n()

const currentTimecode = computed(() => formatTimecode(props.currentTimeMs))
const durationTimecode = computed(() => formatTimecode(props.durationMs))

useLive2DMotionPlaybackKeys({
  disabled: () => props.disabled ?? false,
  goToEnd: () => emit('end'),
  goToStart: () => emit('start'),
  isPlaying: () => props.playing,
  pause: () => emit('pause'),
  play: () => emit('play'),
  stepBackward: steps => emit('stepBackward', steps),
  stepForward: steps => emit('stepForward', steps),
})

function formatTimecode(timeMs: number): string {
  const framesPerSecond = 30
  const totalFrames = Math.max(0, Math.round(timeMs * framesPerSecond / 1000))
  const frames = totalFrames % framesPerSecond
  const totalSeconds = Math.floor(totalFrames / framesPerSecond)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)

  return [hours, minutes, seconds, frames]
    .map(value => String(value).padStart(2, '0'))
    .join(':')
}

function togglePlayback() {
  if (props.playing) {
    emit('pause')
    return
  }

  emit('play')
}
</script>

<template>
  <section
    :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.label')"
    :class="['flex shrink-0 items-center justify-center gap-0.5']"
  >
    <BasicButton
      size="sm"
      :disabled="props.disabled"
      :title="`${t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.start')} · Alt+A`"
      :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.start')"
      @click="emit('start')"
    >
      <span :class="['i-solar:skip-previous-bold-duotone size-4']" />
    </BasicButton>
    <BasicButton
      size="sm"
      :disabled="props.disabled"
      :title="`${t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.step-backward')} · Shift+A`"
      :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.step-backward')"
      @click="emit('stepBackward', 1)"
    >
      <span :class="['i-solar:rewind-back-bold-duotone size-4']" />
    </BasicButton>
    <BasicButton
      size="sm"
      :disabled="props.disabled"
      :title="`${props.playing
        ? t('tamagotchi.settings.devtools.pages.live2d-motion.editor.pause')
        : t('tamagotchi.settings.devtools.pages.live2d-motion.editor.play')} · Shift+Space`"
      :aria-label="props.playing
        ? t('tamagotchi.settings.devtools.pages.live2d-motion.editor.pause')
        : t('tamagotchi.settings.devtools.pages.live2d-motion.editor.play')"
      @click="togglePlayback"
    >
      <span :class="[props.playing ? 'i-solar:pause-bold' : 'i-solar:play-bold', 'size-4']" />
    </BasicButton>

    <output
      :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.timecode')"
      :class="['mx-1 min-w-38 text-center font-mono text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400']"
    >
      {{ currentTimecode }} / {{ durationTimecode }}
    </output>

    <BasicButton
      size="sm"
      :disabled="props.disabled"
      :title="`${t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.step-forward')} · Shift+D`"
      :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.step-forward')"
      @click="emit('stepForward', 1)"
    >
      <span :class="['i-solar:rewind-forward-bold-duotone size-4']" />
    </BasicButton>
    <BasicButton
      size="sm"
      :disabled="props.disabled"
      :title="`${t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.end')} · Alt+D`"
      :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.playback.end')"
      @click="emit('end')"
    >
      <span :class="['i-solar:skip-next-bold-duotone size-4']" />
    </BasicButton>
  </section>
</template>
