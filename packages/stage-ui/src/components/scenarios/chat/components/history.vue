<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem, ContextMessage } from '../../../../types/chat'
import type { ChatToolCallRendererRegistry } from './tool-call-renderer'

import { computed, nextTick, provide, ref, watch } from 'vue'
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
}>()

const chatHistoryRef = ref<HTMLDivElement>()
provide(chatScrollContainerKey, chatHistoryRef)

const collapsed = ref(false)
let savedScrollTop = 0

async function toggleCollapsed() {
  if (!collapsed.value) {
    savedScrollTop = chatHistoryRef.value?.scrollTop ?? 0
  }
  collapsed.value = !collapsed.value
  if (!collapsed.value) {
    await nextTick()
    requestAnimationFrame(() => {
      if (chatHistoryRef.value) {
        chatHistoryRef.value.scrollTop = savedScrollTop
      }
    })
  }
}

watch(() => props.variant, (variant) => {
  if (variant !== 'mobile') {
    collapsed.value = false
  }
})

const { t } = useI18n()
const labels = computed(() => ({
  assistant: props.assistantLabel ?? t('stage.chat.message.character-name.airi'),
  user: props.userLabel ?? t('stage.chat.message.character-name.you'),
  error: props.errorLabel ?? t('stage.chat.message.character-name.core-system'),
  retry: props.retryLabel ?? t('stage.chat.actions.retry'),
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

function emitRetryMessage(message: ChatHistoryItem, index: number) {
  emit('retryMessage', {
    message,
    index,
    key: getChatHistoryItemKey(message, index),
  })
}
</script>

<template>
  <div ref="chatHistoryRef" v-auto-animate flex="~ col" relative w-full rounded-xl px="<sm:2" py="<sm:2" :class="[variant === 'mobile' ? 'gap-1' : 'gap-2', collapsed ? 'h-auto overflow-hidden' : 'h-full overflow-y-auto']">
    <div v-if="variant === 'mobile'" sticky top-0 z-10 flex shrink-0 justify-end pb-1>
      <button
        border="2 solid neutral-100/60 dark:neutral-800/30"
        bg="neutral-50/70 dark:neutral-800/70"
        flex items-center justify-center rounded-xl p-1
        :title="collapsed ? t('stage.chat.history.expand') : t('stage.chat.history.collapse')"
        :aria-expanded="!collapsed"
        @click="toggleCollapsed"
      >
        <div
          v-if="collapsed"
          i-solar:alt-arrow-up-bold-duotone
          size-4
          text="neutral-500 dark:neutral-400"
        />
        <div
          v-else
          i-solar:alt-arrow-down-bold-duotone
          size-4
          text="neutral-500 dark:neutral-400"
        />
      </button>
    </div>
    <template v-if="!collapsed">
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
            :retry-label="labels.retry"
            :can-retry="renderMessages[index - 1]?.role === 'user'"
            :show-placeholder="sending && index === renderMessages.length - 1"
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
            :variant="variant"
            :tool-call-renderers="toolCallRenderers"
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
    </template>
  </div>
</template>
