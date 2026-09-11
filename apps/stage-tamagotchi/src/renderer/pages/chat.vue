<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useStopSpeakingButton } from '@proj-airi/stage-layouts/composables/useStopSpeakingButton'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '@proj-airi/stage-ui/services/speech/bus'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'
import ChatPageShell from './chat-page-shell.vue'

const sessionsDrawerOpen = shallowRef(false)
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
  <ChatPageShell>
    <WindowTitleBar
      title="Chat"
      icon="i-solar:chat-line-bold"
      @title-click="sessionsDrawerOpen = true"
    >
      <template #actions>
        <button
          data-testid="conversation-selector-button"
          :class="[
            'h-7 w-7 flex items-center justify-center rounded-md outline-none',
            'text-base text-neutral-400 transition-colors transition-transform active:scale-95',
            'hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-primary-400',
          ]"
          :title="t('stage.chat.sessions.title')"
          :aria-label="t('stage.chat.sessions.title')"
          @click="sessionsDrawerOpen = true"
        >
          <div class="i-solar:chat-line-bold-duotone" />
        </button>
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
    </WindowTitleBar>
    <InteractiveArea
      class="interaction-area block"
      h-full w-full transition="opacity duration-250"
    />
    <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
