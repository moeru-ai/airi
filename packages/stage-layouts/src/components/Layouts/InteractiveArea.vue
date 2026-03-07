<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { ChatHistory } from '@proj-airi/stage-ui/components'
import { ConversationList, CreateConversationDialog } from '@proj-airi/stage-ui/components/conversations'
import { SyncStatusBadge } from '@proj-airi/stage-ui/components/sync'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useConversationStore } from '@proj-airi/stage-ui/stores/conversations'
import { useDeferredMount } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'

import ChatActionButtons from '../Widgets/ChatActionButtons.vue'
import ChatArea from '../Widgets/ChatArea.vue'
import ChatContainer from '../Widgets/ChatContainer.vue'

const { isReady } = useDeferredMount()
const { sending } = storeToRefs(useChatOrchestratorStore())
const { messages } = storeToRefs(useChatSessionStore())
const { streamingMessage } = storeToRefs(useChatStreamStore())

const conversationStore = useConversationStore()
const { syncStatus, pendingCount } = storeToRefs(conversationStore)

const isLoading = ref(true)
const showSidebar = ref(false)
const showCreateDialog = ref(false)
const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])

onMounted(async () => {
  try {
    await conversationStore.initialize()
  }
  catch (err) {
    console.warn('Failed to initialize conversations:', err)
  }
})
</script>

<template>
  <div flex="col" items-center pt-4>
    <!-- Sync status + sidebar toggle -->
    <div w-full flex items-center justify-between px-2 pb-1>
      <button
                /  10 h-7 w-7 flex items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white hover:text-white
        @click="showSidebar = !showSidebar"
      >
        <div :class="showSidebar ? 'i-carbon-close' : 'i-carbon-side-panel-open'" text-lg />
      </button>
      <SyncStatusBadge :status="syncStatus" :pending-count="pendingCount" />
    </div>

    <div h-full max-h="[85vh]" w-full flex gap-2 py="4">
      <!-- Conversation sidebar -->
      <div
        v-if="showSidebar"
            /  20 w-64 shrink-0 overflow-hidden rounded-xl bg-black backdrop-blur-sm
      >
        <ConversationList @create="showCreateDialog = true" />
      </div>

      <!-- Main chat area -->
      <ChatContainer class="flex-1">
        <div
          v-if="isLoading"
          absolute left-0 top-0 h-1 w-full overflow-hidden rounded-t-xl
          class="bg-primary-500/20"
        >
          <div h-full w="1/3" origin-left bg-primary-500 class="animate-scan" />
        </div>
        <div w="full" max-h="<md:[60%]" py="<sm:2" flex="~ col" rounded="lg" relative h-full flex-1 overflow-hidden px="2 <md:0" py-4>
          <ChatHistory
            v-if="isReady"
            :messages="historyMessages"
            :sending="sending"
            :streaming-message="streamingMessage"
            h-full
            variant="desktop"
            @vue:mounted="isLoading = false"
          />
        </div>
        <ChatArea />
      </ChatContainer>
    </div>

    <ChatActionButtons />

    <!-- Create conversation dialog -->
    <CreateConversationDialog
      :open="showCreateDialog"
      @update:open="showCreateDialog = $event"
      @created="(id) => conversationStore.setActiveConversation(id)"
    />
  </div>
</template>

<style scoped>
@keyframes scan {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

.animate-scan {
  animation: scan 2s infinite linear;
}
</style>
