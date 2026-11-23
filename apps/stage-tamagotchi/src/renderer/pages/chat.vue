<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { CharacterRail, ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
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
// Only the macOS chat window is transparent, and only the side columns show its glass.
const transparentWindow = hasNativeControls
useBackdropSurface(useTemplateRef<HTMLElement>('sidebar'), { enabled: transparentWindow })
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const openSettings = useElectronEventaInvoke(electronOpenSettings)

useChatDraftHandover(interactiveArea)
</script>

<template>
  <ChatPageShell :glass="false">
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
      conversations stay at every window width, like the channel list of Discord. Only the two side columns show the
      window glass, like a sidebar on macOS. The chat paints a solid surface, so it reads as the main content.
    -->
    <div :class="['h-full min-h-0 flex']">
      <div
        ref="sidebar"
        :class="['h-full min-h-0 flex shrink-0', transparentWindow ? 'bg-neutral-100/70 dark:bg-neutral-900/70' : 'bg-neutral-100 dark:bg-neutral-900']"
      >
        <CharacterRail
        docked
        :class="['border-r border-neutral-200/70 dark:border-neutral-800/70']"
        @manage="openSettings({ route: '/settings/airi-card' })"
      />
      <ChatSessionsDrawer
        desktop-mode="inline"
        desktop
        @open-character-settings="characterId => openSettings({ route: `/settings/airi-card/${encodeURIComponent(characterId)}` })"
        :class="['w-60 shrink-0 border-r border-neutral-200/70 dark:border-neutral-800/70']"
        />
      </div>
      <!--
        The chat area has two root elements, so it takes no class. This wrapper paints its solid surface.
      -->
      <div :class="['h-full min-w-0 flex-1 bg-neutral-50 dark:bg-neutral-950']">
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
