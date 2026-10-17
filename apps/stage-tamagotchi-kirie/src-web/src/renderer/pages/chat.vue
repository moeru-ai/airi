<script setup lang="ts">
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { storeToRefs } from 'pinia'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import InteractiveArea from '../components/interactive-area.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'
import ChatPageShell from './chat-page-shell.vue'

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
        <ChatSpeechMuteButton />
        <button
          data-testid="conversation-selector-button"
          :class="[
            'h-7 w-7 flex items-center justify-center rounded-md',
            'text-base text-neutral-400 transition-colors transition-transform active:scale-95',
            'hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-primary-400',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300',
          ]"
          :title="t('stage.chat.sessions.title')"
          :aria-label="t('stage.chat.sessions.title')"
          @click="sessionsDrawerOpen = true"
        >
          <div :class="['i-solar:chat-line-bold-duotone']" />
        </button>
      </template>
    </WindowTitleBar>
    <InteractiveArea :class="['interaction-area block h-full w-full', 'transition-opacity duration-250']" />
    <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
