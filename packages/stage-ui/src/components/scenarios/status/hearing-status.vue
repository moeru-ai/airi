<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusCapsule from './status-capsule.vue'

import { useAudioAnalyzer } from '../../../composables/audio/audio-analyzer'
import { useSpeakingStore } from '../../../stores/audio'
import { useHearingSpeechInputPipeline, useHearingStore } from '../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../stores/settings/audio-device'

defineProps<{ align?: 'start' | 'center' }>()

const { t } = useI18n()
const { enabled, stream, error: microphoneError } = storeToRefs(useSettingsAudioDevice())
const { error, transcript, isTranscribing } = storeToRefs(useHearingSpeechInputPipeline())
const { nowSpeaking } = storeToRefs(useSpeakingStore())
const { volumeLevel } = useAudioAnalyzer()
const { configured } = storeToRefs(useHearingStore())
const issue = computed(() => {
  // Device failure prevents all input, so it takes precedence over provider feedback.
  if (microphoneError.value)
    return microphoneError.value
  if (error.value)
    return error.value
  if (enabled.value && !configured.value)
    return t('stage.status.configure-hearing')
  return undefined
})
const state = computed(() => {
  if (issue.value)
    return 'error'
  if (isTranscribing.value || (enabled.value && !stream.value))
    return 'busy'
  if (enabled.value && !nowSpeaking.value)
    return 'listening'
  return 'idle'
})
const amplitude = computed(() => state.value === 'listening' && stream.value ? Math.min(1, Math.max(0, volumeLevel.value / 100)) : 0)
const label = computed(() => {
  if (issue.value)
    return t('stage.status.hearing-error')
  if (isTranscribing.value)
    return t('stage.status.transcribing')
  if (enabled.value && !stream.value)
    return t('stage.status.preparing')
  if (nowSpeaking.value)
    return t('stage.status.paused')
  return t('stage.status.listening')
})
</script>

<template>
  <StatusCapsule
    v-if="enabled || issue || isTranscribing"
    :align="align"
    :data-status="state"
    :tone="issue ? 'error' : 'neutral'"
    :label="label"
    :details="issue || transcript || t('stage.status.no-transcript')"
  >
    <template #indicator>
      <span aria-hidden="true" :class="['h-5 flex items-center justify-center gap-1']">
        <span
          v-for="(weight, index) in [0.4, 0.75, 1, 0.7, 0.45]"
          :key="index"
          :class="['hearing-bar block w-1 rounded-full bg-current', state === 'busy' && 'hearing-bar-busy']"
          :style="{ height: `${4 + amplitude * weight * 16}px`, animationDelay: `${index * -120}ms` }"
        />
      </span>
      <span v-if="issue" aria-hidden="true" :class="['i-solar:danger-circle-linear ml-1.5 size-4']" />
    </template>
    <template v-if="issue" #details>
      <div
        :class="[
          'z-50 mb-1 max-h-48 w-64 max-w-[calc(100vw-2rem)] overflow-auto break-words rounded-xl p-3 font-cute',
          'bg-violet-100/60 shadow-sm shadow-violet-200/50 backdrop-blur-xl dark:bg-violet-950/60 dark:shadow-none',
        ]"
      >
        <div :class="['flex items-start justify-between gap-3']">
          <span :class="['min-w-0 text-xs text-neutral-500 font-medium dark:text-neutral-400']">{{ label }}</span>
          <span aria-hidden="true" :class="['i-solar:danger-triangle-bold-duotone size-4 shrink-0 text-violet-500']" />
        </div>
        <div :class="['mt-1 whitespace-pre-wrap text-sm text-violet-500 dark:text-violet-300']">
          {{ issue }}
        </div>
      </div>
    </template>
  </StatusCapsule>
</template>

<style scoped>
.hearing-bar {
  transition: height 100ms ease-out;
}
.hearing-bar-busy {
  animation: hearing-wave 900ms ease-in-out infinite;
}
@keyframes hearing-wave {
  0%, 100% { transform: scaleY(1); opacity: 0.45; }
  50% { transform: scaleY(3); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .hearing-bar { transition: none; }
  .hearing-bar-busy { animation: none; }
}
</style>
