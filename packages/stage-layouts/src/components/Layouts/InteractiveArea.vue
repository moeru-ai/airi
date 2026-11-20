<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { ChatBackgroundTasks, ChatHistory } from '@proj-airi/stage-ui/components'
import { VoiceCallCapsule } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useDeferredMount } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import ChatPanelHeader from '../Widgets/chat-panel-header.vue'
import ChatActionButtons from '../Widgets/ChatActionButtons.vue'
import ChatArea from '../Widgets/ChatArea.vue'
import ChatContainer from '../Widgets/ChatContainer.vue'

import { useChatToolCallRerun } from '../../composables/useChatToolCallRerun'
import { useStageChatComposerStore } from '../../stores/chat-composer'

const { isReady } = useDeferredMount()
const chatOrchestrator = useChatStore()
const { activeTurns, backgroundTasks, activeChatArchived: chatArchived } = storeToRefs(chatOrchestrator)
const { activeSessionId, messages } = storeToRefs(useChatSessionStore())
const { streamingMessage } = storeToRefs(useChatStreamStore())
const { isReceivingRemoteStream } = storeToRefs(useContextBridgeStore())

const isLoading = ref(true)
const { composer } = useStageChatComposerStore()
const { clearReplyForMessage, selectReply } = composer
const historyMessages = computed(() => messages.value)
const isActiveSessionSending = computed(() => (
  (activeTurns.value.some(turn => turn.sessionId === activeSessionId.value))
  || isReceivingRemoteStream.value
))
const visibleStreamingMessage = streamingMessage
const { trackChatMessageDeleted } = useAnalytics()
const { rerunToolCall } = useChatToolCallRerun()

async function handleDeleteMessage(payload: { message: ChatHistoryItem, index: number }) {
  const { index, message } = payload
  await chatOrchestrator.deleteMessage({
    sessionId: activeSessionId.value,
    messageId: message?.id,
    index,
  })
  trackChatMessageDeleted({
    source: 'history',
    message_role: message?.role ?? 'unknown',
  })
  clearReplyForMessage(message)
}

async function handleRetryMessage(index: number) {
  await chatOrchestrator.retry({ sessionId: activeSessionId.value, index })
}
</script>

<template>
  <div :class="['flex-col items-center pt-4']">
    <div :class="['h-full max-h-[85vh] w-full py-4']">
      <ChatContainer>
        <div
          v-if="isLoading"
          :class="[
            'absolute left-0 top-0 h-1 w-full overflow-hidden rounded-t-xl',
            'bg-primary-500/20',
          ]"
        >
          <div :class="['animate-scan h-full w-1/3 origin-left', 'bg-primary-500']" />
        </div>
        <ChatPanelHeader />
        <div
          :class="[
            'relative min-h-0 w-full flex flex-1 flex-col overflow-hidden rounded-lg',
            'px-2 py-4 <md:px-0 <sm:py-2',
            '<md:max-h-[60%]',
          ]"
        >
          <ChatHistory
            v-if="isReady"
            :messages="historyMessages"
            :sending="isActiveSessionSending"
            :streaming-message="visibleStreamingMessage"
            :readonly="chatArchived"
            :class="['h-full']"
            variant="desktop"
            @delete-message="handleDeleteMessage"
            @reply-message="selectReply"
            @retry-message="handleRetryMessage($event.index)"
            @tool-call-rerun="rerunToolCall"
            @vue:mounted="isLoading = false"
          />
        </div>
        <ChatBackgroundTasks :tasks="backgroundTasks" @stop="task => chatOrchestrator.stopBackgroundTask(task.sessionId)" @dismiss="task => chatOrchestrator.dismissBackgroundTask(task.sessionId)" />
        <ChatArea :composer="composer" :generating="isActiveSessionSending" />
      </ChatContainer>
    </div>

    <ChatActionButtons />
    <VoiceCallCapsule />
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
