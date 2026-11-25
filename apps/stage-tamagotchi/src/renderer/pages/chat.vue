<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { CharacterRail, ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { storeToRefs } from 'pinia'
import { useTemplateRef } from 'vue'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/InteractiveArea.vue'
import WindowControls from '../components/Window/window-controls.vue'
import ChatPageShell from './chat-page-shell.vue'

import { electronOpenSettings } from '../../shared/eventa'
import { useChatDraftHandover } from '../composables/use-chat-draft-handover'

const { activeCard } = storeToRefs(useAiriCardStore())
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const openSettings = useElectronEventaInvoke(electronOpenSettings)

useChatDraftHandover(interactiveArea)
</script>

<template>
  <!--
    The layout of a messenger: characters, then the conversations of the current character, then the chat. The
    conversations stay at every window width, like the channel list of Discord.
    The window has no title bar across its width, like WeChat on macOS. Each column reaches the top edge. The character
    rail is the only column that shows the window glass, and the system window buttons sit above it. The conversations
    and the chat paint solid fills, and their two shades separate them without a divider line. The chat carries the
    title, the actions, and the window buttons of Windows and Linux.
  -->
  <ChatPageShell :class="['flex']">
    <div :class="['h-full w-20 flex shrink-0 flex-col items-center pt-8 drag-region']">
      <CharacterRail
        docked
        :class="['min-h-0 flex-1 [-webkit-app-region:no-drag]']"
        @manage="openSettings({ route: '/settings/airi-card' })"
      />
    </div>
    <ChatSessionsDrawer
      desktop-mode="inline"
      desktop
      :class="['w-60 shrink-0 pr-2 bg-neutral-50 dark:bg-neutral-800']"
      @open-character-settings="characterId => openSettings({ route: `/settings/airi-card/${encodeURIComponent(characterId)}` })"
    />
    <div
      data-testid="desktop-chat-column"
      :class="['h-full min-w-0 flex flex-1 flex-col bg-white dark:bg-neutral-900']"
    >
      <header :class="['h-11 flex shrink-0 select-none items-center pl-4 drag-region']">
        <span :class="['min-w-0 truncate text-sm font-medium']">{{ activeCard?.name || 'AIRI' }}</span>
        <div :class="['h-full min-w-0 flex-1']" />
        <div :class="['flex items-center gap-1 pr-3 [-webkit-app-region:no-drag]']">
          <ChatSpeechMuteButton />
          <ChatWindowStyleMenu />
        </div>
        <WindowControls />
      </header>
      <!--
        The chat area has two root elements, so it takes no class. This wrapper sizes it.
      -->
      <div :class="['min-h-0 flex-1']">
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
