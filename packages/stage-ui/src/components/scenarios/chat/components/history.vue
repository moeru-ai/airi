<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem, ContextMessage } from '../../../../types/chat'

import { computed, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatAssistantItem from './assistant-item.vue'
import ChatErrorItem from './error-item.vue'
import ChatUserItem from './user-item.vue'

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

function getMessageTimestamp(message: ChatHistoryItem | undefined) {
  return message?.createdAt ?? message?.context?.createdAt
}

function areSameDay(leftTimestamp: number, rightTimestamp: number) {
  const left = new Date(leftTimestamp)
  const right = new Date(rightTimestamp)
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

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

function shouldShowTimestampHeader(index: number, message: ChatHistoryItem) {
  if (index === 0)
    return true

  const currentTs = getMessageTimestamp(message)
  const previousTs = getMessageTimestamp(renderMessages.value[index - 1])
  if (currentTs == null)
    return false
  if (previousTs == null)
    return true
  if (!areSameDay(currentTs, previousTs))
    return true

  return currentTs - previousTs >= 30 * 60 * 1000
}

const renderEntries = computed(() => {
  const entries: Array<{
    type: 'timestamp'
    timestamp: number
  } | {
    type: 'message'
    message: ChatHistoryItem
    index: number
  }> = []

  renderMessages.value.forEach((message, index) => {
    if (shouldShowTimestampHeader(index, message)) {
      entries.push({
        type: 'timestamp',
        timestamp: getMessageTimestamp(message) ?? Date.now(),
      })
    }

    entries.push({
      type: 'message',
      message,
      index,
    })
  })

  return entries
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
    <template v-for="(entry, entryIndex) in renderEntries" :key="entry.type === 'timestamp' ? `timestamp:${entry.timestamp}:${entryIndex}` : getChatHistoryItemKey(entry.message, entry.index)">
      <div v-if="entry.type === 'timestamp'" class="flex items-center gap-3 px-2 py-2">
        <div class="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
        <div class="rounded-full bg-white/80 px-3 py-1 text-xs text-neutral-500 dark:bg-slate-950/80 dark:text-neutral-300">
          [{{ formatChatMessageTimestamp(entry.timestamp) }}]
        </div>
        <div class="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
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
