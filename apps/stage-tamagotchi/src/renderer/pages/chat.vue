<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { ChatSidebar } from '@proj-airi/stage-ui/components'
import { useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { useActiveChatName } from '@proj-airi/stage-ui/composables/use-active-chat-name'
import { useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'
import ChatPageShell from './chat-page-shell.vue'

import { electronOpenSettings } from '../../shared/eventa'
import { useChatDraftHandover } from '../composables/use-chat-draft-handover'

const { t } = useI18n()
/** The title bar names the open chat, as a messenger names the channel above the messages. The column names the character. */
const activeChatName = useActiveChatName()
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
      :title="activeChatName ?? t('stage.chat.sessions.new-chat-fallback')"
      :title-muted="!activeChatName"
      :class="{ 'pl-20!': hasNativeControls }"
      icon="i-mingcute:chat-2-line"
    >
      <template #actions>
        <ChatSpeechMuteButton />
        <ChatWindowStyleMenu />
      </template>
    </WindowTitleBar>
    <!--
      The layout of a messenger: characters, then the chats of the picked character, then the chat. The chats stay at
      every window width, like the channel list of Discord. Only the side columns show the window glass, like a sidebar
      on macOS. The fills separate the columns: the rail is the darkest, and the chat paints a solid surface, so it reads
      as the main content.
    -->
    <div :class="['h-full min-h-0 flex']">
      <div
        ref="sidebar"
        :class="['h-full min-h-0 flex shrink-0', transparentWindow ? 'bg-neutral-100/70 dark:bg-neutral-950/70' : 'bg-neutral-100 dark:bg-neutral-950']"
      >
        <ChatSidebar
          desktop
          @manage="openSettings({ route: '/settings/airi-card' })"
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
