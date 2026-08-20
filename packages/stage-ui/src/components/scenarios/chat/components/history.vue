<script setup lang="ts">
import type { VirtualizerHandle } from 'virtua/vue'

import type { ChatHistoryItem, StreamingAssistantMessage } from '../../../../types/chat'
import type { ChatToolCallRendererRegistry } from './tool-call-renderer'

import { Virtualizer } from 'virtua/vue'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatAssistantItem from './assistant-item.vue'
import ChatErrorItem from './error-item.vue'
import ChatHistoryMessageFrame from './history-message-frame.vue'
import ChatUserItem from './user-item.vue'

import { useChatHistoryScroll } from '../composables/use-chat-history-scroll'
import { useChatHistoryTopFade } from '../composables/use-chat-history-top-fade'
import { useVirtualizerScroll } from '../composables/use-virtualizer-scroll'
import { getChatHistoryItemKey } from '../utils'

const props = withDefaults(defineProps<{
  messages: ChatHistoryItem[]
  streamingMessage?: StreamingAssistantMessage
  sending?: boolean
  assistantLabel?: string
  userLabel?: string
  errorLabel?: string
  retryLabel?: string
  variant?: 'desktop' | 'mobile'
  toolCallRenderers?: ChatToolCallRendererRegistry
}>(), {
  sending: false,
  variant: 'desktop',
  toolCallRenderers: () => ({}),
})

const emit = defineEmits<{
  (e: 'copyMessage', payload: { message: ChatHistoryItem, index: number, key: string | number }): void
  (e: 'deleteMessage', payload: { message: ChatHistoryItem, index: number, key: string | number }): void
  (e: 'retryMessage', payload: { message: ChatHistoryItem, index: number, key: string | number }): void
  (e: 'toolCallRerun', payload: { message: ChatHistoryItem, index: number, key: string | number, toolCallId: string, toolName: string, args: string }): void
}>()

/** Keeps about two mobile viewports ready so fast flicks do not expose an unmounted gap. */
const CHAT_HISTORY_OVERSCAN = 600

const chatHistoryRef = useTemplateRef<HTMLDivElement>('chatHistory')
const virtualizerRef = useTemplateRef<VirtualizerHandle>('virtualizer')
const { scrollToIndex } = useVirtualizerScroll(virtualizerRef)

const { t } = useI18n()
const labels = computed(() => ({
  assistant: props.assistantLabel ?? t('stage.chat.message.character-name.airi'),
  user: props.userLabel ?? t('stage.chat.message.character-name.you'),
  error: props.errorLabel ?? t('stage.chat.message.character-name.core-system'),
  retry: props.retryLabel ?? t('stage.chat.actions.retry'),
}))

const streaming = computed<StreamingAssistantMessage>(() => props.streamingMessage ?? { role: 'assistant', content: '', slices: [], tool_results: [] })
const showStreamingPlaceholder = computed(() => (streaming.value.slices?.length ?? 0) === 0 && !streaming.value.content)
function shouldShowPlaceholder(message: ChatHistoryItem) {
  return !!streaming.value.id && message.id === streaming.value.id
}
const renderMessages = computed<ChatHistoryItem[]>(() => {
  if (!props.sending)
    return props.messages

  const streamId = streaming.value.id
  if (!streamId)
    return props.messages

  const hasStreamAlready = props.messages.some(message => message.role === 'assistant' && message.id === streamId)
  if (hasStreamAlready)
    return props.messages

  return [...props.messages, streaming.value]
})
const topFadeRatio = computed(() => props.variant === 'mobile' ? 0.2 : 0)

useChatHistoryScroll({
  container: chatHistoryRef,
  messages: renderMessages,
  getKey: getChatHistoryItemKey,
  scrollToIndex,
})
useChatHistoryTopFade({
  container: chatHistoryRef,
  fadeRatio: topFadeRatio,
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

function emitRetryMessage(message: ChatHistoryItem, index: number) {
  emit('retryMessage', {
    message,
    index,
    key: getChatHistoryItemKey(message, index),
  })
}

function emitToolCallRerun(
  message: ChatHistoryItem,
  index: number,
  payload: { toolCallId: string, toolName: string, args: string },
) {
  emit('toolCallRerun', {
    message,
    index,
    key: getChatHistoryItemKey(message, index),
    ...payload,
  })
}
</script>

<template>
  <div
    ref="chatHistory"
    :class="[
      'chat-history-list',
      'relative h-full w-full overflow-y-auto rounded-xl',
      '<sm:px-2 <sm:py-2',
      variant === 'mobile' ? 'chat-history-list--mobile' : '',
    ]"
  >
    <Virtualizer
      ref="virtualizer"
      :data="renderMessages"
      :buffer-size="CHAT_HISTORY_OVERSCAN"
    >
      <template #default="{ item: message, index }">
        <ChatHistoryMessageFrame
          :key="getChatHistoryItemKey(message, index)"
          :variant="variant"
          :scroll-container="chatHistoryRef"
        >
          <ChatErrorItem
            v-if="message.role === 'error'"
            :message="message"
            :label="labels.error"
            :retry-label="labels.retry"
            :can-retry="renderMessages[index - 1]?.role === 'user'"
            :show-placeholder="sending && index === renderMessages.length - 1"
            :scroll-container="chatHistoryRef"
            :variant="variant"
            @copy="emitCopyMessage(message, index)"
            @retry="emitRetryMessage(message, index)"
            @delete="emitDeleteMessage(message, index)"
          />
          <ChatAssistantItem
            v-else-if="message.role === 'assistant'"
            :message="message"
            :label="labels.assistant"
            :show-placeholder="shouldShowPlaceholder(message) && showStreamingPlaceholder"
            :scroll-container="chatHistoryRef"
            :variant="variant"
            :tool-call-renderers="toolCallRenderers"
            @copy="emitCopyMessage(message, index)"
            @delete="emitDeleteMessage(message, index)"
            @tool-call-rerun="emitToolCallRerun(message, index, $event)"
          />
          <ChatUserItem
            v-else-if="message.role === 'user'"
            :message="message"
            :label="labels.user"
            :scroll-container="chatHistoryRef"
            :variant="variant"
            @copy="emitCopyMessage(message, index)"
            @delete="emitDeleteMessage(message, index)"
          />
        </ChatHistoryMessageFrame>
      </template>
    </Virtualizer>
  </div>
</template>

<style scoped>
.chat-history-list--mobile :deep(.chat-message-item-container) {
  --chat-top-fade-transparent-stop: -1px;
  --chat-top-fade-opaque-stop: 0px;

  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent var(--chat-top-fade-transparent-stop),
    black var(--chat-top-fade-opaque-stop)
  );
  mask-image: linear-gradient(
    to bottom,
    transparent var(--chat-top-fade-transparent-stop),
    black var(--chat-top-fade-opaque-stop)
  );
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
</style>
