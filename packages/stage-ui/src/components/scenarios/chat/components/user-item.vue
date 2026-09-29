<script setup lang="ts">
import type { ChatHistoryItem, ChatMessage } from '../../../../types/chat'
import type { ChatHistoryReplyPayload } from '../reply'

import { decodeBase64 } from '@moeru/std/base64'
import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatReplyQuote from './reply-quote.vue'

import { chatAudioRepo } from '../../../../database/repos/chat-audio.repo'
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

const noMedia: readonly string[] = Object.freeze([])
const images = computed(() => {
  const raw = props.message.content
  if (!Array.isArray(raw))
    return noMedia
  return raw.filter(part => part.type === 'image_url').map(part => part.image_url.url)
})
const recordings = computed(() => {
  const raw = props.message.content
  return Array.isArray(raw) ? raw.filter(part => part.type === 'input_audio') : []
})
const recordingUrls = shallowRef<Record<number, string>>({})
const pendingRecordingLoads = new Map<number, string>()
let recordingGeneration = 0

function clearRecordingUrls() {
  recordingGeneration++
  for (const url of Object.values(recordingUrls.value))
    URL.revokeObjectURL(url)
  recordingUrls.value = {}
  pendingRecordingLoads.clear()
}

watch(() => props.message.content, clearRecordingUrls)
onScopeDispose(clearRecordingUrls)

async function loadRecording(index: number, event: Event) {
  const recording = recordings.value[index]
  const element = event.currentTarget
  if (!recording || !(element instanceof HTMLAudioElement) || recordingUrls.value[index] || pendingRecordingLoads.has(index))
    return

  const reference = recording.input_audio.data
  const generation = recordingGeneration
  pendingRecordingLoads.set(index, reference)
  void element.play().catch(() => {})
  try {
    const data = await chatAudioRepo.load(reference)
    if (generation !== recordingGeneration || recordings.value[index]?.input_audio.data !== reference)
      return

    const blob = new Blob([new Uint8Array(decodeBase64(data))], { type: `audio/${recording.input_audio.format}` })
    const url = URL.createObjectURL(blob)
    recordingUrls.value = { ...recordingUrls.value, [index]: url }
    element.src = url
    void element.play().catch(() => {})
  }
  catch (error) {
    console.warn('[Chat History] Failed to load voice recording:', error)
  }
  finally {
    if (pendingRecordingLoads.get(index) === reference)
      pendingRecordingLoads.delete(index)
  }
}

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
  <div v-if="message.role === 'user'" :class="['font-cute', containerClasses]" class="ph-no-capture">
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
          flex="~ col" shadow="sm neutral-200/50 dark:none"
          min-w-20 rounded-xl h="unset <sm:fit"
          :class="[
            'chat-message-item-container',
            boxClasses,
            (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
          ]"
        >
          <ChatReplyQuote v-if="replyTarget" :target="replyTarget" />
          <div>
            <span text-sm text="black/60 dark:white/65" font-normal class="inline <sm:hidden">{{ label }}</span>
          </div>
          <div v-if="images.length" :class="['flex flex-wrap gap-2 py-2']">
            <img v-for="(image, index) in images" :key="index" :src="image" :alt="t('stage.chat.images.description')" :class="['max-h-64 max-w-full rounded-xl object-contain']">
          </div>
          <audio
            v-for="(recording, index) in recordings"
            :key="`${index}:${recording.input_audio.data}`"
            :src="recordingUrls[index]"
            :aria-label="t('stage.voice.audio')"
            :class="['my-2 max-w-full w-64']"
            controls
            preload="none"
            @pointerdown="loadRecording(index, $event)"
            @keydown.enter="loadRecording(index, $event)"
            @keydown.space="loadRecording(index, $event)"
            @click="loadRecording(index, $event)"
          />
          <MarkdownRenderer
            v-if="content"
            :content="content"
            class="break-words"
          />
        </div>
      </template>
    </ChatActionMenu>
  </div>
</template>
