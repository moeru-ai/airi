<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { CharacterRail, ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, useTemplateRef } from 'vue'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'
import ChatPageShell from './chat-page-shell.vue'

import { electronOpenSettings } from '../../shared/eventa'
import { useChatDraftHandover } from '../composables/use-chat-draft-handover'

const { activeCard } = storeToRefs(useAiriCardStore())
const hasNativeControls = isElectronWindow(window) && window.platform === 'darwin'
const sessionsDrawerOpen = shallowRef(false)
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const openSettings = useElectronEventaInvoke(electronOpenSettings)

// The conversation list needs room beside the chat. A narrow window keeps the list in the drawer of the title.
const { width: windowWidth } = useWindowSize()
const showsConversationColumn = computed(() => windowWidth.value >= 640)

function openConversations() {
  if (!showsConversationColumn.value)
    sessionsDrawerOpen.value = true
}

useChatDraftHandover(interactiveArea)
</script>

<template>
  <ChatPageShell>
    <WindowTitleBar
      :title="activeCard?.name || 'AIRI'"
      :class="{ 'pl-20!': hasNativeControls }"
      icon="i-solar:chat-line-bold"
      @title-click="openConversations"
    >
      <template #actions>
        <ChatSpeechMuteButton />
        <ChatWindowStyleMenu />
      </template>
    </WindowTitleBar>
    <!-- The layout of a messenger: characters, then the conversations of the current character, then the chat. -->
    <div :class="['h-full min-h-0 flex']">
      <CharacterRail
        docked
        :class="['border-r border-neutral-200/70 dark:border-neutral-800/70']"
        @manage="openSettings({ route: '/settings/airi-card' })"
      />
      <ChatSessionsDrawer
        v-if="showsConversationColumn"
        desktop-mode="inline"
        :class="['w-64 shrink-0 border-r border-neutral-200/70 dark:border-neutral-800/70']"
      />
      <InteractiveArea
        ref="interactive-area"
        :class="['interaction-area block h-full min-w-0 flex-1 transition-opacity duration-250']"
      />
    </div>
    <ChatSessionsDrawer v-if="!showsConversationColumn" v-model="sessionsDrawerOpen" />
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
