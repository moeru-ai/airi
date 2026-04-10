<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'

import { useChatSyncStore } from '../stores/chat-sync'

const chatSyncStore = useChatSyncStore()

onMounted(() => {
  chatSyncStore.initialize('follower')
})

onUnmounted(() => {
  chatSyncStore.dispose()
})
</script>

<template>
  <div h-full w-full pt="44px" overflow-y-scroll>
    <WindowTitleBar
      title="Chat"
      icon="i-solar:chat-line-bold"
    />
    <InteractiveArea
      class="interaction-area block"
      h-full w-full p-4 transition="opacity duration-250"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
