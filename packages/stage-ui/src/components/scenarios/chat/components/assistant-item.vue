<script setup lang="ts">
import type { Component } from 'vue'

import type { ChatHistoryItem, ChatSlices, ChatSlicesText, StreamingAssistantMessage } from '../../../../types/chat'
import type { ChatToolCallRendererRegistry, ChatToolCallState } from './tool-call-renderer'

import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatResponsePart from './response-part.vue'
import ChatToolCallBlock from './tool-call-block.vue'

import { MarkdownRenderer } from '../../../markdown'
import { getChatHistoryItemCopyText } from '../utils'
import { ChatActionMenu } from './action-menu'
import { createToolCallResultLookup, resolveToolCallBlockState } from './tool-call-results'

const props = withDefaults(defineProps<{
  message: StreamingAssistantMessage
  label: string
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
  toolCallRenderers?: ChatToolCallRendererRegistry
}>(), {
  showPlaceholder: false,
  variant: 'desktop',
  toolCallRenderers: () => ({}),
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
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

const toolResultById = computed(() => {
  return createToolCallResultLookup(resolvedSlices.value, props.message.tool_results)
})

type SliceView
  = | { kind: 'tool-call', renderer: Component, toolName: string, args: string, state: ChatToolCallState, result: unknown }
    | { kind: 'text', text: string }
    | { kind: 'tool-call-result' }

// One view-model per slice, resolved once per message change. The message prop
// is replaced on every foreground stream patch, so resolving renderer/state/result
// in template methods would re-run for every slice on each re-render.
const sliceViews = computed<SliceView[]>(() => resolvedSlices.value.map((slice) => {
  if (slice.type === 'tool-call') {
    const result = toolResultById.value.get(slice.toolCall.toolCallId)
    return {
      kind: 'tool-call',
      renderer: props.toolCallRenderers[slice.toolCall.toolName] ?? ChatToolCallBlock,
      toolName: slice.toolCall.toolName,
      args: slice.toolCall.args,
      state: resolveToolCallBlockState(result, { stopped: props.message.stopped }),
      result: result?.result,
    }
  }
  if (slice.type === 'text')
    return { kind: 'text', text: slice.text }
  return { kind: 'tool-call-result' }
}))

const showLoader = computed(() => props.showPlaceholder && resolvedSlices.value.length === 0)
const containerClass = computed(() => props.variant === 'mobile' ? 'mr-0' : 'mr-12')
const boxClasses = computed(() => [
  props.variant === 'mobile' ? 'px-2 py-2 text-sm bg-primary-50/90 dark:bg-primary-950/90' : 'px-3 py-3 bg-primary-50/80 dark:bg-primary-950/80',
])
const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))

const { t } = useI18n()
</script>

<template>
  <div flex :class="containerClass" class="ph-no-capture">
    <ChatActionMenu
      :copy-text="copyText"
      :can-delete="!showPlaceholder"
      @copy="emit('copy')"
      @delete="emit('delete')"
    >
      <template #default="{ setMeasuredElement }">
        <div
          :ref="setMeasuredElement"
          flex="~ col" shadow="sm primary-200/50 dark:none"
          min-w-20 gap-2 rounded-xl h="unset <sm:fit"
          :class="[
            boxClasses,
            (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
          ]"
        >
          <ChatResponsePart
            v-if="message.categorization"
            :message="message"
            :variant="variant"
          />
          <div class="<sm:hidden">
            <span text-sm text="black/60 dark:white/65" font-normal>{{ label }}</span>
          </div>
          <div v-if="sliceViews.length > 0" class="flex flex-col gap-2 break-words" text="primary-700 dark:primary-100">
            <template v-for="(view, sliceIndex) in sliceViews" :key="sliceIndex">
              <component
                :is="view.renderer"
                v-if="view.kind === 'tool-call'"
                :tool-name="view.toolName"
                :args="view.args"
                :state="view.state"
                :result="view.result"
              />
              <template v-else-if="view.kind === 'text'">
                <MarkdownRenderer :content="view.text" />
              </template>
            </template>
          </div>
          <div v-else-if="showLoader" i-eos-icons:three-dots-loading />
          <div
            v-if="message.stopped"
            :class="[
              'flex items-center gap-1 self-start rounded-full px-2 py-0.5',
              'text-xs text-neutral-500 dark:text-neutral-400',
              'bg-neutral-200/50 dark:bg-neutral-700/40',
            ]"
          >
            <div class="i-solar:stop-circle-bold-duotone h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ t('stage.chat.message.stopped') }}</span>
          </div>
        </div>
      </template>
    </ChatActionMenu>
  </div>
</template>
