<script setup lang="ts">
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useTheme } from '@proj-airi/ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ViewControls from '../Layouts/InteractiveArea/Actions/ViewControls.vue'

import { useStopSpeakingButton } from '../../composables/useStopSpeakingButton'
import { BackgroundDialogPicker } from '../Backgrounds'

const { isDark, toggleDark } = useTheme()
const { speechMuted, toggleSpeechMuted } = useStopSpeakingButton()
const { t } = useI18n()

const backgroundDialogOpen = ref(false)
const sessionsDrawerOpen = ref(false)
</script>

<template>
  <BackgroundDialogPicker v-model="backgroundDialogOpen" />
  <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
  <div absolute bottom--8 right-0 flex gap-2>
    <div flex gap-1>
      <button
        data-testid="conversation-selector-button"
        :class="[
          'max-h-[10lh] min-h-[1lh] flex items-center justify-center rounded-md p-2 outline-none',
          'bg-neutral-100 text-lg text-neutral-500 transition-colors transition-transform active:scale-95',
          'hover:text-primary-500 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:text-primary-400',
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
          'max-h-[10lh] min-h-[1lh] flex items-center justify-center rounded-md p-2 outline-none',
          'text-lg transition-colors transition-transform active:scale-95',
          speechMuted
            ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300'
            : 'bg-neutral-100 text-neutral-500 hover:text-primary-500 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:text-primary-400',
        ]"
        :title="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
        :aria-label="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
        :aria-pressed="speechMuted"
        @click="toggleSpeechMuted"
      >
        <div v-if="speechMuted" class="i-solar:volume-cross-bold-duotone" />
        <div v-else class="i-solar:volume-loud-bold-duotone" />
      </button>
    </div>
    <ViewControls />
    <button
      class="max-h-[10lh] min-h-[1lh]"
      bg="neutral-100 dark:neutral-800"
      text="lg neutral-500 dark:neutral-400"
      flex items-center justify-center rounded-md p-2 outline-none
      transition-colors transition-transform active:scale-95
      @click="() => toggleDark()"
    >
      <Transition name="fade" mode="out-in">
        <div v-if="isDark" i-solar:moon-bold />
        <div v-else i-solar:sun-2-bold />
      </Transition>
    </button>
    <button
      class="max-h-[10lh] min-h-[1lh]"
      bg="neutral-100 dark:neutral-800"
      text="lg neutral-500 dark:neutral-400"
      flex items-center justify-center rounded-md p-2 outline-none
      transition-colors transition-transform active:scale-95
      title="Background"
      @click="backgroundDialogOpen = true"
    >
      <div i-solar:gallery-wide-bold-duotone />
    </button>
  </div>
</template>
