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
      conversations stay at every window width, like the channel list of Discord. The window is opaque. Glass behind the
      title bar or a sidebar needs the traffic lights inside a glass column, and that column is too wide for the rail.
    -->
    <div :class="['h-full min-h-0 flex']">
      <div :class="['h-full min-h-0 flex shrink-0 bg-neutral-100 dark:bg-neutral-900']">
        <CharacterRail
          docked
          :class="['border-r border-neutral-200/70 dark:border-neutral-800/70']"
          @manage="openSettings({ route: '/settings/airi-card' })"
        />
        <ChatSessionsDrawer
          desktop-mode="inline"
          desktop
          :class="['w-60 shrink-0 border-r border-neutral-200/70 dark:border-neutral-800/70']"
          @open-character-settings="characterId => openSettings({ route: `/settings/airi-card/${encodeURIComponent(characterId)}` })"
        />
      </div>
      <!--
        The chat area has two root elements, so it takes no class. This wrapper paints its solid surface.
      -->
      <div :class="['h-full min-w-0 flex-1 bg-white dark:bg-neutral-900']">
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
