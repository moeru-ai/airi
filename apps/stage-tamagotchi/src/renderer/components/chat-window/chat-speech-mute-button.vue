<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useStopSpeakingButton } from '@proj-airi/stage-layouts/composables/useStopSpeakingButton'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '@proj-airi/stage-ui/services/speech/bus'
import { GhostButton } from '@proj-airi/ui'
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
  <GhostButton
    data-testid="speech-mute-button"
    size="unset"
    :active="speechMuted"
    :class="['size-7 text-neutral-400 dark:text-neutral-500']"
    :title="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
    :aria-label="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
    :aria-pressed="speechMuted"
    @click="toggleSpeechMuted"
  >
    <div :class="[speechMuted ? 'i-solar:volume-cross-bold-duotone' : 'i-solar:volume-loud-bold-duotone', 'size-4']" />
  </GhostButton>
</template>
