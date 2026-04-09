<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem, ContextMessage } from '../../../../types/chat'

import { computed, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatAssistantItem from './assistant-item.vue'
import ChatErrorItem from './error-item.vue'
import ChatUserItem from './user-item.vue'

import { useChatHistoryScroll } from '../composables/use-chat-history-scroll'
import { chatScrollContainerKey } from '../constants'
import { getChatHistoryItemKey } from '../utils'

const props = withDefaults(defineProps<{
  messages: ChatHistoryItem[]
  streamingMessage?: ChatAssistantMessage & { createdAt?: number }
  sending?: boolean
  assistantLabel?: string
  userLabel?: string
  errorLabel?: string
  variant?: 'desktop' | 'mobile'
}>(), {
  sending: false,
  variant: 'desktop',
})

const emit = defineEmits<{
  (e: 'copyMessage', payload: { message: ChatHistoryItem, index: number, key: string | number }): void
  (e: 'deleteMessage', payload: { message: ChatHistoryItem, index: number, key: string | number }): void
}>()

const chatHistoryRef = ref<HTMLDivElement>()
provide(chatScrollContainerKey, chatHistoryRef)

const { t } = useI18n()
const labels = computed(() => ({
  assistant: props.assistantLabel ?? t('stage.chat.message.character-name.airi'),
  user: props.userLabel ?? t('stage.chat.message.character-name.you'),
  error: props.errorLabel ?? t('stage.chat.message.character-name.core-system'),
}))

const streaming = computed<ChatAssistantMessage & { context?: ContextMessage } & { createdAt?: number }>(() => props.streamingMessage ?? { role: 'assistant', content: '', slices: [], tool_results: [], createdAt: Date.now() })
const showStreamingPlaceholder = computed(() => (streaming.value.slices?.length ?? 0) === 0 && !streaming.value.content)
const streamingTs = computed(() => streaming.value?.createdAt)
function shouldShowPlaceholder(message: ChatHistoryItem) {
  const ts = streamingTs.value
  if (ts == null)
    return false

  return message.context?.createdAt === ts || message.createdAt === ts
}
const renderMessages = computed<ChatHistoryItem[]>(() => {
  if (!props.sending)
    return props.messages

  const streamTs = streamingTs.value
  if (!streamTs)
    return props.messages

  const hasStreamAlready = streamTs && props.messages.some(msg => msg?.role === 'assistant' && msg?.createdAt === streamTs)
  if (hasStreamAlready)
    return props.messages

  return [...props.messages, streaming.value]
})

useChatHistoryScroll({
  containerRef: chatHistoryRef,
  messages: renderMessages,
  getKey: getChatHistoryItemKey,
})

function emitCopyMessage(message: ChatHistoryItem, index: number) {
  emit('copyMessage', {
    message,
    index,
    key: getChatHistoryItemKey(message, index),
  })
}

function emitDeleteMessage(message: ChatHistoryItem, index: number) {
  emit('deleteMessage', {
    message,
    index,
    key: getChatHistoryItemKey(message, index),
  })
}
</script>

<template>
  <div ref="chatHistoryRef" v-auto-animate flex="~ col" relative h-full w-full overflow-y-auto rounded-xl px="<sm:2" py="<sm:2" :class="variant === 'mobile' ? 'gap-1' : 'gap-2'">
    <template v-for="(message, index) in renderMessages" :key="getChatHistoryItemKey(message, index)">
      <div
        :data-chat-message-index="index"
        :data-chat-message-key="String(getChatHistoryItemKey(message, index))"
        :data-chat-message-role="message.role"
      >
        <ChatErrorItem
          v-if="message.role === 'error'"
          :message="message"
          :label="labels.error"
          :show-placeholder="sending && index === renderMessages.length - 1"
          :variant="variant"
          @copy="emitCopyMessage(message, index)"
          @delete="emitDeleteMessage(message, index)"
        />
        <ChatAssistantItem
          v-else-if="message.role === 'assistant'"
          :message="message"
          :label="labels.assistant"
          :show-placeholder="shouldShowPlaceholder(message) && showStreamingPlaceholder"
          :variant="variant"
          @copy="emitCopyMessage(message, index)"
          @delete="emitDeleteMessage(message, index)"
        />
        <ChatUserItem
          v-else-if="message.role === 'user'"
          :message="message"
          :label="labels.user"
          :variant="variant"
          @copy="emitCopyMessage(message, index)"
          @delete="emitDeleteMessage(message, index)"
        />
      </div>
    </template>
  </div>
</template>