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
      bar and the character rail, is one surface. On macOS it shows the window glass. The conversations and the chat
      share one solid card that floats 6px inside the frame. Two shades separate them, so they need no divider line.
    -->
    <div :class="['h-full min-h-0 flex pb-1.5 pr-1.5']">
      <CharacterRail
        docked
        @manage="openSettings({ route: '/settings/airi-card' })"
      />
      <div
        data-testid="desktop-chat-card"
        :class="[
          'min-w-0 flex flex-1 overflow-hidden rounded-lg shadow-sm',
          'border border-neutral-200/80 dark:border-neutral-800',
        ]"
      >
        <ChatSessionsDrawer
          desktop-mode="inline"
          desktop
          :class="['w-60 shrink-0 pr-2', 'bg-neutral-50 dark:bg-neutral-800']"
          @open-character-settings="characterId => openSettings({ route: `/settings/airi-card/${encodeURIComponent(characterId)}` })"
        />
        <!--
          The chat area has two root elements, so it takes no class. This wrapper paints its shade.
        -->
        <div :class="['h-full min-w-0 flex-1 bg-white dark:bg-neutral-900']">
          <InteractiveArea
            ref="interactive-area"
            :class="['interaction-area block h-full w-full transition-opacity duration-250']"
          />
        </div>
      </div>
    </div>
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
