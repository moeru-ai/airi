<script setup lang="ts">
import type { ChatAssistantMessage } from '../../../types/chat'
import type { ChatHistoryMessage } from './types'

import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatAssistantItem from './ChatAssistantItem.vue'
import ChatErrorItem from './ChatErrorItem.vue'
import ChatUserItem from './ChatUserItem.vue'

const props = withDefaults(defineProps<{
  messages: ChatHistoryMessage[]
  streamingMessage?: ChatAssistantMessage & { context?: { ts?: number } }
  sending?: boolean
  assistantLabel?: string
  userLabel?: string
  errorLabel?: string
  variant?: 'desktop' | 'mobile'
}>(), {
  sending: false,
  variant: 'desktop',
})

const chatHistoryRef = ref<HTMLDivElement>()

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

const streaming = computed<ChatAssistantMessage & { context?: { ts?: number } }>(() => props.streamingMessage ?? { role: 'assistant', content: '', slices: [], tool_results: [] })
const showStreamingPlaceholder = computed(() => (streaming.value.slices?.length ?? 0) === 0 && !streaming.value.content)
const streamingTs = computed(() => streaming.value.context?.ts)
const renderMessages = computed<ChatHistoryMessage[]>(() => {
  if (!props.sending)
    return props.messages

  const streamTs = streamingTs.value
  if (!streamTs)
    return props.messages

  const hasStreamAlready = streamTs && props.messages.some(msg => msg.context?.ts === streamTs)
  if (hasStreamAlready)
    return props.messages

  return [...props.messages, streaming.value]
})
</script>

<template>
  <div ref="chatHistoryRef" v-auto-animate flex="~ col" relative h-full w-full overflow-y-auto rounded-xl px="<sm:2" py="<sm:2" :class="variant === 'mobile' ? 'gap-1' : 'gap-2'">
    <template v-for="(message, index) in renderMessages" :key="message.context?.ts ?? index">
      <div v-if="message.role === 'error'">
        <ChatErrorItem
          :message="message"
          :label="labels.error"
          :show-placeholder="sending && index === renderMessages.length - 1"
          :variant="variant"
        />
      </div>

      <div v-else-if="message.role === 'assistant'">
        <ChatAssistantItem
          :message="message"
          :label="labels.assistant"
          :show-placeholder="message.context?.ts === streamingTs ? showStreamingPlaceholder : false"
          :variant="variant"
        />
      </div>

      <div v-else-if="message.role === 'user'">
        <ChatUserItem
          :message="message"
          :label="labels.user"
          :variant="variant"
        />
      </div>
    </template>
  </div>
</template>
