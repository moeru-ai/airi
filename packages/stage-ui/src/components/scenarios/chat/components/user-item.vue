<script setup lang="ts">
import type { ChatHistoryItem, ChatMessage } from '../../../../types/chat'
import type { ChatHistoryReplyPayload } from '../reply'

import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatReplyQuote from './reply-quote.vue'

import { MarkdownRenderer } from '../../../markdown'
import { ChatActionMenu } from '../components/action-menu'
import { getChatHistoryItemCopyText } from '../utils'

const props = withDefaults(defineProps<{
  message: Extract<ChatMessage, { role: 'user' }>
  label: string
  replyTarget?: ChatHistoryReplyPayload
  canReply?: boolean
  scrollContainer?: HTMLElement | null
  variant?: 'desktop' | 'mobile'
  /** How the bubble paints its background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
}>(), {
  canReply: false,
  scrollContainer: null,
  variant: 'desktop',
  surface: 'translucent',
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
  (e: 'reply'): void
}>()

const { t } = useI18n()
const content = computed(() => {
  const raw = props.message.content
  if (typeof raw === 'string')
    return raw

  if (Array.isArray(raw)) {
    return raw.filter(part => part.type === 'text').map(part => part.text).join('\n')
  }

  return ''
})

const emptyImages: readonly string[] = Object.freeze([])
const images = computed(() => typeof props.message.content === 'string'
  ? emptyImages
  : props.message.content.filter(part => part.type === 'image_url').map(part => part.image_url.url))
const audio = computed(() => typeof props.message.content === 'string'
  ? []
  : props.message.content.filter(part => part.type === 'input_audio').map(part => `data:audio/${part.input_audio.format === 'mp3' ? 'mpeg' : 'wav'};base64,${part.input_audio.data}`))

const containerClasses = computed(() => [
  'flex',
  props.variant === 'mobile' ? 'ml-0 flex-row' : 'ml-12 flex-row-reverse',
])

const boxClasses = computed(() => {
  const spacing = props.variant === 'mobile' ? 'px-2 py-1.5 text-sm' : 'px-3 pt-3 pb-2'
  if (props.surface === 'opaque')
    return [spacing, 'bg-neutral-100 shadow-md dark:bg-neutral-800']

  return [
    spacing,
    props.variant === 'mobile'
      ? 'bg-neutral-100/60 backdrop-blur-xl dark:bg-neutral-800/60'
      : 'bg-neutral-100/80 dark:bg-neutral-800/80',
  ]
})
const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))
</script>

<template>
  <div v-if="message.role === 'user'" :class="['font-cute ph-no-capture', containerClasses]">
    <ChatActionMenu
      :can-reply="canReply"
      :copy-text="copyText"
      placement="left"
      :press-feedback-enabled="variant === 'mobile'"
      :scroll-container="scrollContainer"
      @copy="emit('copy')"
      @delete="emit('delete')"
      @reply="emit('reply')"
    >
      <template #default="{ setMeasuredElement }">
        <div
          :ref="setMeasuredElement"
          :class="[
            'chat-message-item-container flex flex-col',
            'min-w-20 rounded-xl h-unset <sm:h-fit',
            'shadow-sm shadow-neutral-200/50 dark:shadow-none',
            boxClasses,
            (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
          ]"
        >
          <ChatReplyQuote v-if="replyTarget" :target="replyTarget" />
          <div v-if="variant === 'mobile'">
            <span :class="['inline <sm:hidden text-sm font-normal', 'text-black/60 dark:text-white/65']">{{ label }}</span>
          </div>
          <div v-if="images.length" :class="['flex flex-wrap gap-2 py-2']">
            <img v-for="(image, index) in images" :key="index" :src="image" :alt="t('stage.chat.images.description')" :class="['max-h-64 max-w-full rounded-xl object-contain']">
          </div>
          <MarkdownRenderer
            :content="content as string"
            class="break-words"
          />
          <audio v-for="(source, index) in audio" :key="index" :src="source" controls :aria-label="t('stage.chat.voice-message.preview')" :class="['my-2 max-w-full']" />
        </div>
      </template>
    </ChatActionMenu>
  </div>
</template>
