<script setup lang="ts">
import type { ToolCallRerunRequest } from '../../../../stores/tool-call-rerun'
import type { ChatAssistantMessage, ChatHistoryItem, ChatSlices, ChatSlicesText, ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ChatHistoryReplyPayload } from '../reply'
import type { ChatToolCallRendererRegistry, ChatToolCallWidgetRegistry } from './tool-call-renderer'

import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatReplyCard from './reply-card.vue'
import ChatReplyQuote from './reply-quote.vue'
import ResponseCitations from './response-citations.vue'
import ChatResponsePart from './response-part.vue'
import ChatSticker from './sticker.vue'
import ChatToolCallGroup from './tool-call-group.vue'

import { MarkdownRenderer } from '../../../markdown'
import { getChatHistoryItemCopyText } from '../utils'
import { ChatActionMenu } from './action-menu'
import { groupToolCallSlices } from './tool-call-group'
import { createToolCallResultLookup, resolveToolCallBlockState } from './tool-call-results'
import { builtinToolCallWidgets } from './tool-call-widgets'

const props = withDefaults(defineProps<{
  /** A reply of the history, or the reply that streams now. The card state of its tool calls is keyed by its id. */
  message: ChatAssistantMessage & { id?: string }
  label: string
  replyTarget?: ChatHistoryReplyPayload
  canReply?: boolean
  scrollContainer?: HTMLElement | null
  showPlaceholder?: boolean
  /** The reply is still being written. */
  streaming?: boolean
  variant?: 'desktop' | 'mobile'
  /** How the bubble paints its background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
  toolCallRenderers?: ChatToolCallRendererRegistry
  /** Widgets that show tool results inside the unfolded rows of a tool call group. They add to the built-in widgets. */
  toolCallWidgets?: ChatToolCallWidgetRegistry
}>(), {
  canReply: false,
  showPlaceholder: false,
  streaming: false,
  scrollContainer: null,
  variant: 'desktop',
  surface: 'translucent',
  toolCallRenderers: () => ({}),
  toolCallWidgets: () => ({}),
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
  (e: 'reply'): void
  (e: 'toolCallRerun', payload: ToolCallRerunRequest): void
}>()

const { t } = useI18n()

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
 * Triggering workflow: ChatToolCallGroup `toolCallRerun` -> emitToolCallRerun
 * -> ChatHistory `toolCallRerun` -> executeToolCallRerun in the owning runtime.
 */
function emitToolCallRerun(sliceIndex: number, payload: ToolCallRerunRequest) {
  const invocationId = invocationBySlice.value.get(sliceIndex)
  emit('toolCallRerun', invocationId === undefined ? payload : { ...payload, invocationId })
}

const toolCallWidgets = computed<ChatToolCallWidgetRegistry>(() => ({ ...builtinToolCallWidgets, ...props.toolCallWidgets }))

// The model writes a card for this reply now. Until it arrives, the reply says so, so it never looks empty.
const drawingCard = computed(() => props.streaming && props.message.pendingContent === 'card')

// A call with its own renderer shows by itself. Every other call joins a group with the calls next to it.
const sliceEntries = computed(() => groupToolCallSlices(resolvedSlices.value, toolName => Boolean(props.toolCallRenderers[toolName])))

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
  <div :class="['flex font-cute ph-no-capture', containerClass]">
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
          :class="[
            'chat-message-item-container',
            'flex flex-col gap-2 min-w-20 rounded-xl <sm:h-fit',
            'shadow-sm shadow-primary-200/50 dark:shadow-none',
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
          <div :class="['<sm:hidden']">
            <span :class="['text-sm font-normal', 'text-black/60 dark:text-white/65']">{{ label }}</span>
          </div>
          <div v-if="resolvedSlices.length > 0" :class="['flex flex-col gap-2 break-words', 'text-primary-700 dark:text-primary-100']">
            <template v-for="entry in sliceEntries" :key="entry.kind === 'slice' ? entry.sliceIndex : `group-${entry.key}`">
              <ChatToolCallGroup
                v-if="entry.kind === 'tool-group'"
                :items="entry.items"
                :result-of="getToolCallResult"
                :widgets="toolCallWidgets"
                :streaming="streaming"
                :message-id="message.id"
                @tool-call-rerun="emitToolCallRerun"
              />
              <component
                :is="props.toolCallRenderers[entry.slice.toolCall.toolName]"
                v-else-if="entry.slice.type === 'tool-call'"
                :tool-call-id="entry.slice.toolCall.toolCallId"
                :tool-name="entry.slice.toolCall.toolName"
                :args="entry.slice.toolCall.args"
                :state="resolveToolCallBlockState(getToolCallResult(entry.sliceIndex))"
                :result="getToolCallResult(entry.sliceIndex)?.result"
                @tool-call-rerun="emitToolCallRerun(entry.sliceIndex, $event)"
              />
              <ChatSticker v-else-if="entry.slice.type === 'sticker'" :sticker-id="entry.slice.stickerId" />
              <ChatReplyCard v-else-if="entry.slice.type === 'card'" :card="entry.slice" />
              <MarkdownRenderer v-else-if="entry.slice.type === 'text'" :content="entry.slice.text" :streaming="streaming" />
            </template>
            <div v-if="drawingCard" :class="['flex items-center gap-1.5 text-[11px]', 'text-neutral-500 dark:text-neutral-400']" aria-live="polite">
              <span :class="['i-svg-spinners:ring-resize', 'text-xs', 'text-primary-500 dark:text-primary-300']" aria-hidden="true" />
              <span>{{ t('stage.chat.reply-card.drawing') }}</span>
            </div>
          </div>
          <ResponseCitations v-if="message.citations?.length" :citations="message.citations" />
          <div v-if="!resolvedSlices.length && showLoader" :class="['i-eos-icons:three-dots-loading']" />
        </div>
      </template>
    </ChatActionMenu>
  </div>
</template>
