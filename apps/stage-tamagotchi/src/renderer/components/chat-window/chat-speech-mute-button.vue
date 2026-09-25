<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useStopSpeakingButton } from '@proj-airi/stage-layouts/composables/useStopSpeakingButton'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '@proj-airi/stage-ui/services/speech/bus'
import { useI18n } from 'vue-i18n'

const getOutputPlaybackState = defineInvoke(getSpeechBusContext(), speechOutputGetPlaybackState)
const { speechMuted, toggleSpeechMuted } = useStopSpeakingButton({
  resolveSpeakingState: async () => {
    // A BroadcastChannel round trip is normally immediate. Bound the
    // analytics-only lookup so a reloading output renderer cannot stall mute.
    const state = await getOutputPlaybackState(undefined, {
      signal: AbortSignal.timeout(1000),
    })
    return state.speaking
  },
})
const { t } = useI18n()
</script>

<template>
  <button
    data-testid="speech-mute-button"
    :class="[
      'h-7 w-7 flex items-center justify-center rounded-md outline-none',
      'text-base transition-colors transition-transform active:scale-95',
      speechMuted
        ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300'
        : 'text-neutral-400 hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-primary-400',
    ]"
    :title="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
    :aria-label="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
    :aria-pressed="speechMuted"
    @click="toggleSpeechMuted"
  >
    <div v-if="speechMuted" class="i-solar:volume-cross-bold-duotone" />
    <div v-else class="i-solar:volume-loud-bold-duotone" />
  </button>
</template>
