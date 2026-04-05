<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem, ContextMessage } from '../../../../types/chat'

import { computed, onMounted, provide, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatAssistantItem from './assistant-item.vue'
import ChatErrorItem from './error-item.vue'
import ChatUserItem from './user-item.vue'

import { chatScrollContainerKey } from '../constants'
import type { ChatHistoryEntry } from '../history-entries'
import { buildChatHistoryEntries } from '../history-entries'
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

const chatHistoryRef = useTemplateRef<HTMLDivElement>('chatHistoryRef')
provide(chatScrollContainerKey, chatHistoryRef)

const { t } = useI18n()
const labels = computed(() => ({
  assistant: props.assistantLabel ?? t('stage.chat.message.character-name.airi'),
  user: props.userLabel ?? t('stage.chat.message.character-name.you'),
  error: props.errorLabel ?? t('stage.chat.message.character-name.core-system'),
}))

function scrollToBottom() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!chatHistoryRef.value)
        return

      chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
    })
  })
}

watch([() => props.messages, () => props.streamingMessage], scrollToBottom, { deep: true, flush: 'post' })
watch(() => props.sending, scrollToBottom, { flush: 'post' })
onMounted(scrollToBottom)

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

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatChatMessageTimestamp(timestamp: number) {
  return timestampFormatter.format(new Date(timestamp))
}

const historyClasses = computed(() => [
  'relative h-full w-full overflow-y-auto rounded-xl',
  'flex flex-col',
  props.variant === 'mobile' ? 'gap-1 px-2 py-2' : 'gap-2',
])

const timestampRowClasses = computed(() => [
  'flex items-center',
  props.variant === 'mobile' ? 'gap-2 px-1 py-1' : 'gap-3 px-1 py-1.5',
])

const timestampDividerClasses = [
  'h-px flex-1',
  'bg-neutral-200/70 dark:bg-neutral-800/70',
]

const timestampLabelClasses = computed(() => [
  'shrink-0 rounded-full border font-medium tabular-nums shadow-sm backdrop-blur-md',
  'border-neutral-200/70 bg-white/70 text-neutral-500',
  'dark:border-neutral-800/80 dark:bg-neutral-950/70 dark:text-neutral-300',
  props.variant === 'mobile' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
])

const renderEntries = computed<ChatHistoryEntry[]>(() => buildChatHistoryEntries(renderMessages.value))

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
  <div
    ref="chatHistoryRef"
    v-auto-animate
    :class="historyClasses"
  >
    <template v-for="(entry, entryIndex) in renderEntries" :key="entry.type === 'timestamp' ? `timestamp:${entry.timestamp}:${entryIndex}` : getChatHistoryItemKey(entry.message, entry.index)">
      <div v-if="entry.type === 'timestamp'" :class="timestampRowClasses">
        <div :class="timestampDividerClasses" />
        <div :class="timestampLabelClasses">
          {{ formatChatMessageTimestamp(entry.timestamp) }}
        </div>
        <div :class="timestampDividerClasses" />
      </div>

      <div v-else-if="entry.message.role === 'error'">
        <ChatErrorItem
          :message="entry.message"
          :label="labels.error"
          :show-placeholder="sending && entry.index === renderMessages.length - 1"
          :variant="variant"
          @copy="emitCopyMessage(entry.message, entry.index)"
          @delete="emitDeleteMessage(entry.message, entry.index)"
        />
      </div>

      <div v-else-if="entry.message.role === 'assistant'">
        <ChatAssistantItem
          :message="entry.message"
          :label="labels.assistant"
          :show-placeholder="shouldShowPlaceholder(entry.message) && showStreamingPlaceholder"
          :variant="variant"
          @copy="emitCopyMessage(entry.message, entry.index)"
          @delete="emitDeleteMessage(entry.message, entry.index)"
        />
      </div>

      <div v-else-if="entry.message.role === 'user'">
        <ChatUserItem
          :message="entry.message"
          :label="labels.user"
          :variant="variant"
          @copy="emitCopyMessage(entry.message, entry.index)"
          @delete="emitDeleteMessage(entry.message, entry.index)"
        />
      </div>
    </template>
  </div>
</template>
