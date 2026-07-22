<script setup lang="ts">
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { shallowRef } from 'vue'

import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'

import { useChatSyncStore } from '../stores/chat-sync'

const sessionsDrawerOpen = shallowRef(false)
const chatSync = useChatSyncStore()

const sessionActions = {
  createSession: (characterId: string) => chatSync.requestCreateSession(characterId),
  deleteSession: (sessionId: string) => chatSync.requestDeleteSession(sessionId),
  selectSession: (sessionId: string) => chatSync.requestSelectSession(sessionId),
}
</script>

<template>
  <div h-full w-full pt="44px" overflow-y-scroll>
    <WindowTitleBar
      title="Chat"
      icon="i-solar:chat-line-bold"
      @title-click="sessionsDrawerOpen = true"
    />
    <InteractiveArea
      v-model:sessions-drawer-open="sessionsDrawerOpen"
      class="interaction-area block"
      h-full w-full p-4 transition="opacity duration-250"
    />
    <ChatSessionsDrawer v-model="sessionsDrawerOpen" :session-actions="sessionActions" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
