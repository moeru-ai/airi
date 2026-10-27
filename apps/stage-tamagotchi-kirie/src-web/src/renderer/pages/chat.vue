<script setup lang="ts">
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { storeToRefs } from 'pinia'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'
import ChatPageShell from './chat-page-shell.vue'

import { chatHeaderButtonClass } from '../components/chat-window/chat-header-button'

const { activeCard } = storeToRefs(useAiriCardStore())
const sessionsDrawerOpen = shallowRef(false)
const { t } = useI18n()
</script>

<template>
  <ChatPageShell>
    <WindowTitleBar
      :title="activeCard?.name || 'AIRI'"
      icon="i-solar:chat-line-bold"
      @title-click="sessionsDrawerOpen = true"
    >
      <template #actions>
        <button
          data-testid="conversation-selector-button"
          :class="chatHeaderButtonClass('plain')"
          :title="t('stage.chat.sessions.title')"
          :aria-label="t('stage.chat.sessions.title')"
          @click="sessionsDrawerOpen = true"
        >
          <div :class="['i-solar:chat-line-bold-duotone']" />
        </button>
        <ChatSpeechMuteButton />
        <ChatWindowStyleMenu />
      </template>
    </WindowTitleBar>
    <InteractiveArea
      :class="['interaction-area block h-full w-full', 'transition-opacity duration-250']"
    />
    <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
