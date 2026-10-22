<script setup lang="ts">
import type { ChatHeaderButtonVariant } from './chat-header-button'

import { defineInvoke } from '@moeru/eventa'
import { useStopSpeakingButton } from '@proj-airi/stage-layouts/composables/useStopSpeakingButton'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '@proj-airi/stage-ui/services/speech/bus'
import { useI18n } from 'vue-i18n'

import { chatHeaderButtonClass } from './chat-header-button'

withDefaults(defineProps<{
  variant?: ChatHeaderButtonVariant
}>(), {
  variant: 'plain',
})

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
    :class="chatHeaderButtonClass(variant, speechMuted)"
    :title="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
    :aria-label="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
    :aria-pressed="speechMuted"
    @click="toggleSpeechMuted"
  >
    <div v-if="speechMuted" :class="['i-solar:volume-cross-bold-duotone']" />
    <div v-else :class="['i-solar:volume-loud-bold-duotone']" />
  </button>
</template>
