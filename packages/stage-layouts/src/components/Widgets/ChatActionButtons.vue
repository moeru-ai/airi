<script setup lang="ts">
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useTheme } from '@proj-airi/ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ViewControls from '../Layouts/InteractiveArea/Actions/ViewControls.vue'
import ChatToolbarButton from './ChatToolbarButton.vue'

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
      <ChatToolbarButton
        data-testid="conversation-selector-button"
        :title="t('stage.chat.sessions.title')"
        :aria-label="t('stage.chat.sessions.title')"
        @click="sessionsDrawerOpen = true"
      >
        <div class="i-solar:chat-line-outline size-5" />
      </ChatToolbarButton>
      <ChatToolbarButton
        data-testid="speech-mute-button"
        :active="speechMuted"
        :title="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
        :aria-label="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
        :aria-pressed="speechMuted"
        @click="toggleSpeechMuted"
      >
        <div v-if="speechMuted" class="i-solar:volume-cross-outline size-5" />
        <div v-else class="i-solar:volume-loud-outline size-5" />
      </ChatToolbarButton>
    </div>
    <ViewControls />
    <ChatToolbarButton
      :title="t('stage.mobile-tools.dark-mode')"
      :aria-label="t('stage.mobile-tools.dark-mode')"
      @click="() => toggleDark()"
    >
      <Transition name="fade" mode="out-in">
        <div v-if="isDark" class="i-solar:moon-outline size-5" />
        <div v-else class="i-solar:sun-2-outline size-5" />
      </Transition>
    </ChatToolbarButton>
    <ChatToolbarButton
      :title="t('stage.mobile-tools.background')"
      :aria-label="t('stage.mobile-tools.background')"
      @click="backgroundDialogOpen = true"
    >
      <div class="i-solar:gallery-wide-outline size-5" />
    </ChatToolbarButton>
  </div>
</template>
