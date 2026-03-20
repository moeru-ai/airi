<script setup lang="ts">
import type { ChatAssistantMessage, ChatSlices, ChatSlicesText } from '../../../types/chat'

import { computed } from 'vue'

import ChatResponsePart from './response-part.vue'
import ChatToolCallBlock from './tool-call-block.vue'

import { MarkdownRenderer } from '../../markdown'

const props = withDefaults(defineProps<{
  message: ChatAssistantMessage
  label: string
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
}>(), {
  showPlaceholder: false,
  variant: 'desktop',
})

interface DisplaySegment {
  type: 'text' | 'act'
  content: string
}

const ACT_MARKER_RE = /<\|ACT:[\s\S]*?(?:\|>|>)/gi

function parseAssistantDisplayText(text: string): DisplaySegment[] {
  const segments: DisplaySegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(ACT_MARKER_RE)) {
    const start = match.index ?? 0
    const raw = match[0]

    if (start > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, start),
      })
    }

    segments.push({
      type: 'act',
      content: raw,
    })

    lastIndex = start + raw.length
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return segments
}

function sanitizeAssistantTextForDisplay(text: string) {
  return parseAssistantDisplayText(text)
    .filter(segment => segment.type === 'text')
    .map(segment => segment.content)
    .join('')
    .replace(/^\s*\n/, '')
}

const resolvedSlices = computed<ChatSlices[]>(() => {
  if (props.message.slices?.length) {
    return props.message.slices.reduce<ChatSlices[]>((acc, slice) => {
      if (slice.type !== 'text')
        return [...acc, slice]

      const cleaned = sanitizeAssistantTextForDisplay(slice.text)
      if (!cleaned.trim())
        return acc

      return [...acc, { ...slice, text: cleaned } satisfies ChatSlicesText]
    }, [])
  }

  if (typeof props.message.content === 'string' && props.message.content.trim()) {
    const cleaned = sanitizeAssistantTextForDisplay(props.message.content)
    if (cleaned.trim())
      return [{ type: 'text', text: cleaned } satisfies ChatSlicesText]
  }

  if (Array.isArray(props.message.content)) {
    const textPart = props.message.content.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    if (textPart?.text) {
      const cleaned = sanitizeAssistantTextForDisplay(textPart.text)
      if (cleaned.trim())
        return [{ type: 'text', text: cleaned } satisfies ChatSlicesText]
    }
  }

  return []
})

const showLoader = computed(() => props.showPlaceholder && resolvedSlices.value.length === 0)
const containerClass = computed(() => props.variant === 'mobile' ? 'mr-0' : 'mr-12')
const boxClasses = computed(() => [
  props.variant === 'mobile' ? 'px-2 py-2 text-sm bg-primary-50/90 dark:bg-primary-950/90' : 'px-3 py-3 bg-primary-50/80 dark:bg-primary-950/80',
])
</script>

<template>
  <div flex :class="containerClass" class="ph-no-capture">
    <div
      flex="~ col" shadow="sm primary-200/50 dark:none"
      min-w-20 rounded-xl h="unset <sm:fit"
      :class="boxClasses"
    >
      <div>
        <span text-sm text="black/60 dark:white/65" font-normal class="inline <sm:hidden">{{ label }}</span>
      </div>
      <div v-if="resolvedSlices.length > 0" class="break-words" text="primary-700 dark:primary-100">
        <template v-for="(slice, sliceIndex) in resolvedSlices" :key="sliceIndex">
          <ChatToolCallBlock
            v-if="slice.type === 'tool-call'"
            :tool-name="slice.toolCall.toolName"
            :args="slice.toolCall.args"
            class="mb-2"
          />
          <template v-else-if="slice.type === 'tool-call-result'" />
          <template v-else-if="slice.type === 'text'">
            <MarkdownRenderer :content="slice.text" />
          </template>
        </template>
      </div>
      <div v-else-if="showLoader" i-eos-icons:three-dots-loading />

      <ChatResponsePart
        v-if="message.categorization"
        :message="message"
        :variant="variant"
      />
    </div>
  </div>
</template>
