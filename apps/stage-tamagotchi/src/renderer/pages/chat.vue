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
const openSettings = useElectronEventaInvoke(electronOpenSettings)
// A narrow chat window shows avatars only, so the chat keeps its width. A wide one also shows the names.
const { width: windowWidth } = useWindowSize()
const railLabels = computed(() => windowWidth.value >= 640)
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')

useChatDraftHandover(interactiveArea)
</script>

<template>
  <ChatPageShell>
    <WindowTitleBar
      :title="activeCard?.name || 'AIRI'"
      :class="{ 'pl-20!': hasNativeControls }"
      icon="i-solar:chat-line-bold"
      @title-click="sessionsDrawerOpen = true"
    >
      <template #actions>
        <ChatSpeechMuteButton />
        <ChatWindowStyleMenu />
      </template>
    </WindowTitleBar>
    <div :class="['h-full w-full flex']">
      <CharacterRail
        :labels="railLabels"
        :class="['shrink-0 bg-neutral-100/60 dark:bg-neutral-900/60']"
        @manage="openSettings({ route: '/settings/airi-card' })"
      />
      <InteractiveArea
        ref="interactive-area"
        :class="['interaction-area block h-full min-w-0 flex-1 transition-opacity duration-250']"
      />
    </div>
    <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
  </ChatPageShell>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
