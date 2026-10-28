<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusCapsule from './status-capsule.vue'

import { useAudioAnalyzer } from '../../../composables/audio/audio-analyzer'
import { useHearingStore } from '../../../stores/modules/hearing'
import { useVoiceControlsStore } from '../../../stores/voice-controls'

defineProps<{ align?: 'start' | 'center' }>()

const { t } = useI18n()
const { error, snapshot } = storeToRefs(useVoiceControlsStore())
const enabled = computed(() => snapshot.value.microphone?.enabled ?? false)
const ready = computed(() => snapshot.value.microphone?.ready ?? false)
const microphoneError = computed(() => snapshot.value.microphone?.error)
const transcript = computed(() => snapshot.value.input?.text)
const isTranscribing = computed(() => snapshot.value.input?.phase === 'finalizing')
const { volumeLevel } = useAudioAnalyzer()
const { configured, enabled: hearingEnabled } = storeToRefs(useHearingStore())
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
  if (isTranscribing.value || (enabled.value && !ready.value))
    return 'busy'
  if (enabled.value)
    return 'listening'
  return 'idle'
})
const amplitude = computed(() => state.value === 'listening' && ready.value ? Math.min(1, Math.max(0, volumeLevel.value / 100)) : 0)
const label = computed(() => {
  if (issue.value)
    return t('stage.status.hearing-error')
  if (isTranscribing.value)
    return t('stage.status.transcribing')
  if (enabled.value && !ready.value)
    return t('stage.status.preparing')
  return t('stage.status.listening')
})
</script>

<template>
  <StatusCapsule
    v-if="hearingEnabled && (enabled || issue || isTranscribing)"
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
          :class="['relative block size-1', state === 'busy' && 'hearing-bar-busy']"
          :style="{ '--hearing-bar-stretch': amplitude * weight * 4, 'animationDelay': `${index * -120}ms` }"
        >
          <span :class="['hearing-bar-top absolute inset-0 rounded-full bg-current']" />
          <span :class="['hearing-bar-middle absolute inset-0 bg-current']" />
          <span :class="['hearing-bar-bottom absolute inset-0 rounded-full bg-current']" />
        </span>
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
/*
 * A height transition lays out the page on each frame. A transform transition runs on the compositor, but a scaleY on
 * one round element stretches its round ends into ellipses. So each bar has two round ends and a middle part. The ends
 * move apart by half the extra height, and the middle part scales to fill the space between their centers.
 */
.hearing-bar-top,
.hearing-bar-middle,
.hearing-bar-bottom {
  transition: transform 100ms ease-out;
}
.hearing-bar-top {
  transform: translateY(calc(var(--hearing-bar-stretch) * -2px));
}
.hearing-bar-middle {
  transform: scaleY(var(--hearing-bar-stretch));
}
.hearing-bar-bottom {
  transform: translateY(calc(var(--hearing-bar-stretch) * 2px));
}
.hearing-bar-busy {
  animation: hearing-wave 900ms ease-in-out infinite;
}
@keyframes hearing-wave {
  0%, 100% { transform: scaleY(1); opacity: 0.45; }
  50% { transform: scaleY(3); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .hearing-bar-top, .hearing-bar-middle, .hearing-bar-bottom { transition: none; }
  .hearing-bar-busy { animation: none; }
}
</style>
