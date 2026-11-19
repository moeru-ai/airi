<script setup lang="ts">
import type { ChatHeaderButtonVariant } from './chat-header-button'

import { useStopSpeakingButton } from '@proj-airi/stage-layouts/composables/useStopSpeakingButton'
import { DockButton } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { createPlaybackSpeakingReader } from '../../composables/playback-speaking-reader'
import { chatHeaderButtonClass } from './chat-header-button'

withDefaults(defineProps<{
  variant?: ChatHeaderButtonVariant
}>(), {
  variant: 'plain',
})

const { speechMuted, toggleSpeechMuted } = useStopSpeakingButton({
  resolveSpeakingState: createPlaybackSpeakingReader(),
})
const { t } = useI18n()
const label = computed(() => speechMuted.value ? t('stage.speech-output.unmute') : t('stage.speech-output.mute'))
</script>

<template>
  <DockButton
    v-if="variant === 'dock'"
    data-testid="speech-mute-button"
    icon="i-mingcute:volume-line"
    pressed-icon="i-mingcute:volume-off-line"
    :label="label"
    :pressed="speechMuted"
    @click="toggleSpeechMuted"
  />
  <button
    v-else
    data-testid="speech-mute-button"
    :class="chatHeaderButtonClass(speechMuted)"
    :title="label"
    :aria-label="label"
    :aria-pressed="speechMuted"
    @click="toggleSpeechMuted"
  >
    <div v-if="speechMuted" class="i-solar:volume-cross-bold-duotone" />
    <div v-else class="i-solar:volume-loud-bold-duotone" />
  </button>
</template>
