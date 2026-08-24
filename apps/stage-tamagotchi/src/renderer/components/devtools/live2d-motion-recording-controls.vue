<script setup lang="ts">
import type {
  Live2DMotionRecordingStatus,
  ReadonlyLive2DMotionRecording,
} from '../../composables/live2d-motion-recording'

import { Button } from '@proj-airi/ui'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  status: Live2DMotionRecordingStatus
  recording: ReadonlyLive2DMotionRecording | null
  importError: string
}>()

const emit = defineEmits<{
  toggleRecording: []
  togglePlayback: []
  exportRecording: []
  importRecording: [file: File]
}>()

const { t } = useI18n()
const importFileInput = useTemplateRef<HTMLInputElement>('importFileInput')
const isIdle = computed(() => props.status.type === 'idle')
const isRecording = computed(() => props.status.type === 'recording')
const isPlaying = computed(() => props.status.type === 'playing')
const recordingDuration = computed(() => {
  if (!props.recording)
    return '0.00 s'

  return `${(props.recording.durationMs / 1000).toFixed(2)} s`
})
const statusText = computed(() => {
  if (isRecording.value)
    return t('tamagotchi.settings.devtools.pages.live2d-motion.recording.status.recording')
  if (isPlaying.value)
    return t('tamagotchi.settings.devtools.pages.live2d-motion.recording.status.playing')
  if (!props.recording)
    return t('tamagotchi.settings.devtools.pages.live2d-motion.recording.status.empty')

  return t('tamagotchi.settings.devtools.pages.live2d-motion.recording.status.ready', {
    count: props.recording.samples.length,
    duration: recordingDuration.value,
  })
})

function openImportPicker() {
  importFileInput.value?.click()
}

function handleImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file)
    emit('importRecording', file)
  target.value = ''
}
</script>

<template>
  <section :class="['flex flex-col gap-3 rounded-2xl p-4', 'border border-neutral-200/80 bg-white/60', 'dark:border-neutral-800/80 dark:bg-neutral-950/40']">
    <div :class="['flex flex-wrap gap-2']">
      <Button
        :icon="isRecording ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:record-circle-bold-duotone'"
        :color="isRecording ? 'red' : 'primary'"
        :variant="isRecording ? 'primary' : 'secondary'"
        :disabled="isPlaying"
        @click="emit('toggleRecording')"
      >
        {{ isRecording
          ? t('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.stop-recording')
          : t('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.record') }}
      </Button>
      <Button
        :icon="isPlaying ? 'i-solar:stop-circle-bold-duotone' : 'i-solar:play-circle-bold-duotone'"
        :color="isPlaying ? 'red' : 'primary'"
        :variant="isPlaying ? 'primary' : 'secondary'"
        :disabled="isRecording || (!recording && !isPlaying)"
        @click="emit('togglePlayback')"
      >
        {{ isPlaying
          ? t('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.stop-playback')
          : t('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.play') }}
      </Button>
      <Button
        icon="i-solar:download-minimalistic-bold-duotone"
        color="primary"
        variant="secondary"
        :disabled="!isIdle || !recording"
        @click="emit('exportRecording')"
      >
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.export') }}
      </Button>
      <Button
        icon="i-solar:upload-minimalistic-bold-duotone"
        color="primary"
        variant="secondary"
        :disabled="!isIdle"
        @click="openImportPicker"
      >
        {{ t('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.import') }}
      </Button>
    </div>

    <div :class="['flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300']">
      <span
        :class="[
          isRecording
            ? 'i-solar:record-circle-bold-duotone text-red-500 animate-pulse'
            : isPlaying
              ? 'i-solar:play-circle-bold-duotone text-primary-500'
              : 'i-solar:clapperboard-play-bold-duotone text-neutral-500',
          'size-5',
        ]"
      />
      {{ statusText }}
    </div>

    <input
      ref="importFileInput"
      type="file"
      accept=".json,application/json"
      :class="['hidden']"
      @change="handleImport"
    >
    <p v-if="importError" :class="['text-sm text-red-500 dark:text-red-400']">
      {{ importError }}
    </p>
  </section>
</template>
