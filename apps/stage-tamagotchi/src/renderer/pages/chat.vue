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
// Only the macOS chat window is transparent, and only the character rail shows its glass.
const transparentWindow = isElectronWindow(window) && window.platform === 'darwin'
useBackdropSurface(useTemplateRef<HTMLElement>('sidebar'), { enabled: transparentWindow })
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const openSettings = useElectronEventaInvoke(electronOpenSettings)

useChatDraftHandover(interactiveArea)
</script>

<template>
  <ChatPageShell :glass="false">
    <!--
      The title bar has no fill. The character rail shows through on the left, and the solid header below paints the
      rest. The padding keeps the title clear of the rail.
    -->
    <WindowTitleBar
      :title="activeCard?.name || 'AIRI'"
      transparent
      :class="['pl-24!']"
      icon="i-solar:chat-line-bold"
    >
      <template #actions>
        <ChatSpeechMuteButton />
        <ChatWindowStyleMenu />
      </template>
    </WindowTitleBar>
    <!--
      The layout of a messenger: characters, then the conversations of the current character, then the chat. The
      conversations stay at every window width, like the channel list of Discord. Only the character rail shows the
      window glass, like a sidebar on macOS. It runs up to the top of the window, so the traffic lights sit on the
      glass. The header, the conversations, and the chat paint solid surfaces, so they read as the main content.
    -->
    <div :class="['h-full min-h-0 flex']">
      <!-- 80px holds the macOS traffic lights, which span about 16px to 70px from the left edge. -->
      <div
        ref="sidebar"
        :class="[
          'h-full min-h-0 w-20 flex shrink-0 flex-col items-center pt-11',
          'border-r border-neutral-200/70 dark:border-neutral-800/70',
          transparentWindow ? 'bg-neutral-100/70 dark:bg-neutral-900/70' : 'bg-neutral-100 dark:bg-neutral-900',
        ]"
      >
        <CharacterRail
          docked
          :class="['min-h-0 flex-1']"
          @manage="openSettings({ route: '/settings/airi-card' })"
        />
      </div>
      <div :class="['h-full min-w-0 flex flex-1 flex-col pt-11 bg-neutral-50 dark:bg-neutral-950']">
        <div :class="['min-h-0 flex flex-1 border-t border-neutral-200/70 dark:border-neutral-800/70']">
          <ChatSessionsDrawer
            desktop-mode="inline"
            desktop
            :class="['w-60 shrink-0 border-r border-neutral-200/70 dark:border-neutral-800/70']"
            @open-character-settings="characterId => openSettings({ route: `/settings/airi-card/${encodeURIComponent(characterId)}` })"
          />
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
      </div>
    </div>
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
