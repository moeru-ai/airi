<script setup lang="ts">
import type { ToolCallRerunRequest } from '../../../../stores/tool-call-rerun'
import type { ChatAssistantMessage, ChatHistoryItem, ChatSlices, ChatSlicesText, ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ChatHistoryReplyPayload } from '../reply'
import type { ChatToolCallRendererRegistry } from './tool-call-renderer'

import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { computed } from 'vue'

import ChatReplyQuote from './reply-quote.vue'
import ResponseCitations from './response-citations.vue'
import ChatResponsePart from './response-part.vue'
import ChatToolCallBlock from './tool-call-block.vue'

import { MarkdownRenderer } from '../../../markdown'
import { getChatHistoryItemCopyText } from '../utils'
import { ChatActionMenu } from './action-menu'
import { createToolCallResultLookup, resolveToolCallBlockState } from './tool-call-results'

const props = withDefaults(defineProps<{
  message: ChatAssistantMessage
  label: string
  replyTarget?: ChatHistoryReplyPayload
  canReply?: boolean
  scrollContainer?: HTMLElement | null
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
  /** How the bubble paints its background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
  toolCallRenderers?: ChatToolCallRendererRegistry
}>(), {
  canReply: false,
  showPlaceholder: false,
  scrollContainer: null,
  variant: 'desktop',
  surface: 'translucent',
  toolCallRenderers: () => ({}),
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
  (e: 'reply'): void
  (e: 'toolCallRerun', payload: ToolCallRerunRequest): void
}>()

const resolvedSlices = computed<ChatSlices[]>(() => {
  if (props.message.slices?.length) {
    return props.message.slices
  }

  if (typeof props.message.content === 'string' && props.message.content.trim()) {
    return [{ type: 'text', text: props.message.content } satisfies ChatSlicesText]
  }

  if (Array.isArray(props.message.content)) {
    const textPart = props.message.content.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    if (textPart?.text)
      return [{ type: 'text', text: textPart.text } satisfies ChatSlicesText]
  }

  return []
})

const toolResultBySlice = computed(() => {
  return createToolCallResultLookup(resolvedSlices.value, props.message.tool_results)
})

function getToolCallResult(sliceIndex: number): ChatSlicesToolCallResult | undefined {
  return toolResultBySlice.value.get(sliceIndex)
}

const invocationBySlice = computed(() => {
  const invocations = props.message.generationTranscript?.rounds.flatMap(round => round.toolInvocations)
  const occurrences = new Map<string, number>()
  const ids = new Map<number, string>()
  for (const [index, slice] of resolvedSlices.value.entries()) {
    if (slice.type !== 'tool-call')
      continue
    const callId = slice.toolCall.toolCallId
    const occurrence = occurrences.get(callId) ?? 0
    occurrences.set(callId, occurrence + 1)
    const invocation = invocations?.filter(call => call.callId === callId)[occurrence]
    if (invocation)
      ids.set(index, invocation.id)
  }
  return ids
})

/**
 * Triggering workflow: ChatToolCallBlock `toolCallRerun` -> emitToolCallRerun
 * -> ChatHistory `toolCallRerun` -> executeToolCallRerun in the owning runtime.
 */
function emitToolCallRerun(sliceIndex: number, payload: ToolCallRerunRequest) {
  const invocationId = invocationBySlice.value.get(sliceIndex)
  emit('toolCallRerun', invocationId === undefined ? payload : { ...payload, invocationId })
}

function getToolCallRenderer(slice: ChatSlices) {
  if (slice.type !== 'tool-call') {
    return ChatToolCallBlock
  }

  return props.toolCallRenderers[slice.toolCall.toolName] ?? ChatToolCallBlock
}

const showLoader = computed(() => props.showPlaceholder && resolvedSlices.value.length === 0)
const containerClass = computed(() => props.variant === 'mobile' ? 'mr-0' : 'mr-12')
const boxClasses = computed(() => {
  const spacing = props.variant === 'mobile' ? 'px-2 py-2 text-sm' : 'px-3 py-3'
  if (props.surface === 'opaque')
    return [spacing, 'bg-primary-50 shadow-md dark:bg-primary-950']

  return [
    spacing,
    props.variant === 'mobile'
      ? 'bg-primary-50/60 backdrop-blur-xl dark:bg-primary-950/60'
      : 'bg-primary-50/80 dark:bg-primary-950/75',
  ]
})
const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))
</script>

<template>
  <div flex :class="['font-cute', containerClass]" class="ph-no-capture">
    <ChatActionMenu
      :copy-text="copyText"
      :can-reply="canReply"
      :can-delete="!showPlaceholder"
      :press-feedback-enabled="variant === 'mobile'"
      :scroll-container="scrollContainer"
      @copy="emit('copy')"
      @delete="emit('delete')"
      @reply="emit('reply')"
    >
      <template #default="{ setMeasuredElement }">
        <div
          :ref="setMeasuredElement"
          flex="~ col" shadow="sm primary-200/50 dark:none"
          min-w-20 gap-2 rounded-xl h="unset <sm:fit"
          :class="[
            'chat-message-item-container',
            boxClasses,
            (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
          ]"
        >
          <ChatReplyQuote v-if="replyTarget" :target="replyTarget" />
          <ChatResponsePart
            v-if="message.categorization"
            :message="message"
            :variant="variant"
          />
          <div class="<sm:hidden">
            <span text-sm text="black/60 dark:white/65" font-normal>{{ label }}</span>
          </div>
          <div v-if="resolvedSlices.length > 0" class="flex flex-col gap-2 break-words" text="primary-700 dark:primary-100">
            <template v-for="(slice, sliceIndex) in resolvedSlices" :key="sliceIndex">
              <component
                :is="getToolCallRenderer(slice)"
                v-if="slice.type === 'tool-call'"
                :tool-call-id="slice.toolCall.toolCallId"
                :tool-name="slice.toolCall.toolName"
                :args="slice.toolCall.args"
                :state="resolveToolCallBlockState(getToolCallResult(sliceIndex))"
                :result="getToolCallResult(sliceIndex)?.result"
                @tool-call-rerun="emitToolCallRerun(sliceIndex, $event)"
              />
              <template v-else-if="slice.type === 'tool-call-result'" />
              <template v-else-if="slice.type === 'text'">
                <MarkdownRenderer :content="slice.text" />
              </template>
            </template>
          </div>
          <ResponseCitations v-if="message.citations?.length" :citations="message.citations" />
          <div v-if="!resolvedSlices.length && showLoader" i-eos-icons:three-dots-loading />
        </div>
      </template>
    </ChatActionMenu>
  </div>
</template>
