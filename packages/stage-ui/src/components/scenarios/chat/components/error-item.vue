<script setup lang="ts">
import type { ChatHistoryItem, ErrorMessage } from '../../../../types/chat'

import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'

import { MarkdownRenderer } from '../../../markdown'
import { getChatHistoryItemCopyText } from '../utils'
import { ChatActionMenu } from './action-menu'

const props = withDefaults(defineProps<{
  message: ErrorMessage
  label: string
  retryLabel?: string
  canRetry?: boolean
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
}>(), {
  canRetry: false,
  showPlaceholder: false,
  variant: 'desktop',
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'retry'): void
  (e: 'delete'): void
}>()

const boxClasses = computed(() => [
  'min-w-0',
  'max-w-full',
  props.variant === 'mobile' ? 'px-2 py-2 text-sm' : 'px-3 py-3',
])
const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))
</script>

<template>
  <div
    :class="[
      'flex flex-col',
      variant === 'mobile' ? 'mr-0' : 'mr-12',
    ]"
  >
    <ChatActionMenu
      :copy-text="copyText"
      :can-delete="!showPlaceholder"
      :can-retry="canRetry && !showPlaceholder"
      @copy="emit('copy')"
      @retry="emit('retry')"
      @delete="emit('delete')"
    >
      <template #default="{ setMeasuredElement }">
        <div
          :ref="setMeasuredElement"
          :class="[
            boxClasses,
            'relative',
            'flex flex-col',
            'min-w-20 rounded-xl',
            'h-unset <sm:h-fit',
            'shadow-sm shadow-violet-200/50 dark:shadow-none',
            'bg-violet-100/80 dark:bg-violet-950/80',
            (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
          ]"
        >
          <div flex="~ row" gap-2>
            <div flex-1 class="inline <sm:hidden">
              <span text-sm text="black/60 dark:white/65" font-normal>{{ label }}</span>
            </div>
            <div i-solar:danger-triangle-bold-duotone text-violet-500 />
          </div>
          <div v-if="showPlaceholder" i-eos-icons:three-dots-loading />
          <MarkdownRenderer
            v-else
            :content="message.content"
            class="whitespace-pre-wrap break-all text-violet-500 dark:text-violet-300"
          />
        </div>
      </template>
    </ChatActionMenu>
    <div
      v-if="canRetry && !showPlaceholder"
      :class="[
        'self-end mt-1 w-fit',
      ]"
    >
      <Button
        size="sm"
        variant="ghost"
        shape="square"
        icon="i-solar:refresh-bold"
        :aria-label="retryLabel"
        @click="emit('retry')"
      />
    </div>
  </div>
</template>
