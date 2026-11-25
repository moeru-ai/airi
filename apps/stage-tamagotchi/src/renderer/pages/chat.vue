<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { CharacterRail, ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { storeToRefs } from 'pinia'
import { useTemplateRef } from 'vue'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'
import ChatPageShell from './chat-page-shell.vue'

import { electronOpenSettings } from '../../shared/eventa'
import { useChatDraftHandover } from '../composables/use-chat-draft-handover'

const { activeCard } = storeToRefs(useAiriCardStore())
const hasNativeControls = isElectronWindow(window) && window.platform === 'darwin'
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const openSettings = useElectronEventaInvoke(electronOpenSettings)

useChatDraftHandover(interactiveArea)
</script>

<template>
  <ChatPageShell>
    <WindowTitleBar
      transparent
      :title="activeCard?.name || 'AIRI'"
      :class="{ 'pl-20!': hasNativeControls }"
      icon="i-solar:chat-line-bold"
    >
      <template #actions>
        <ChatSpeechMuteButton />
        <ChatWindowStyleMenu />
      </template>
    </WindowTitleBar>
    <!--
      The layout of a messenger: characters, then the conversations of the current character, then the chat. The
      conversations stay at every window width, like the channel list of Discord. The window frame, that is the title
      bar and the two side columns, is one surface. On macOS it shows the window glass. The chat is a solid card that
      floats inside the frame, so it reads as the main content.
    -->
    <div :class="['h-full min-h-0 flex']">
      <div :class="['h-full min-h-0 flex shrink-0']">
        <CharacterRail
          docked
          :class="['border-r border-neutral-200/70 dark:border-neutral-800/70']"
          @manage="openSettings({ route: '/settings/airi-card' })"
        />
        <ChatSessionsDrawer
          desktop-mode="inline"
          desktop
          :class="['w-60 shrink-0']"
          @open-character-settings="characterId => openSettings({ route: `/settings/airi-card/${encodeURIComponent(characterId)}` })"
        />
      </div>
      <!--
        The chat area has two root elements, so it takes no class. This wrapper paints its solid card. The 8px gap to the
        window edge is the same on the right and at the bottom.
      -->
      <div
        data-testid="desktop-chat-card"
        :class="[
          'mb-2 mr-2 ml-1 h-[calc(100%-0.5rem)] min-w-0 flex-1 overflow-hidden rounded-xl',
          'border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900',
        ]"
      >
        <InteractiveArea
          ref="interactive-area"
          :class="['interaction-area block h-full w-full transition-opacity duration-250']"
        />
      </div>
    </div>
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
