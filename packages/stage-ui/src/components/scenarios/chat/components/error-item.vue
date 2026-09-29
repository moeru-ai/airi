<script setup lang="ts">
import type { ChatHistoryItem, ErrorMessage } from '../../../../types/chat'

import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { BasicButton, IconButton } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { MarkdownRenderer } from '../../../markdown'
import { getChatHistoryItemCopyText } from '../utils'
import { ChatActionMenu } from './action-menu'

const props = withDefaults(defineProps<{
  message: ErrorMessage
  label: string
  retryLabel?: string
  scrollContainer?: HTMLElement | null
  canRetry?: boolean
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
  /** How the bubble paints its background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
}>(), {
  canRetry: false,
  scrollContainer: null,
  showPlaceholder: false,
  variant: 'desktop',
  surface: 'translucent',
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'retry'): void
  (e: 'delete'): void
}>()
const { t } = useI18n()
const detailsOpen = shallowRef(false)

const summary = computed(() => {
  const firstLine = props.message.content.trim().split(/\r?\n/u, 1)[0]
  const payloadStart = firstLine.indexOf(': {')
  const text = payloadStart >= 0 ? firstLine.slice(0, payloadStart) : firstLine
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
})
const hasDetails = computed(() => props.message.content.length > 240 || props.message.content.split(/\r?\n/u).length > 4)

const boxClasses = computed(() => {
  if (props.surface === 'opaque')
    return ['bg-violet-100 shadow-md dark:bg-violet-950']

  return [
    props.variant === 'mobile'
      ? 'bg-violet-100/60 backdrop-blur-xl dark:bg-violet-950/60'
      : 'bg-violet-100/80 dark:bg-violet-950/80',
  ]
})
const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))
</script>

<template>
  <div
    :class="[
      'max-w-[min(28rem,calc(100vw-2rem))] flex flex-col',
      variant === 'mobile' ? 'mr-0' : 'mr-12',
      'font-cute',
    ]"
  >
    <ChatActionMenu
      :copy-text="copyText"
      :can-delete="!showPlaceholder"
      :can-retry="canRetry && !showPlaceholder"
      :scroll-container="scrollContainer"
      @copy="emit('copy')"
      @retry="emit('retry')"
      @delete="emit('delete')"
    >
      <template #default="{ setMeasuredElement }">
        <div
          :ref="setMeasuredElement"
          :class="[
            'chat-message-item-container',
            boxClasses,
            'relative max-w-full overflow-hidden',
            'min-w-20 flex flex-col rounded-xl',
            'h-unset <sm:h-fit',
            'shadow-sm shadow-violet-200/50 dark:shadow-none',
            (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
          ]"
        >
          <div :class="[variant === 'mobile' ? 'px-2 py-2' : 'px-3 py-3']">
            <div :class="['flex items-start justify-between gap-3']">
              <span :class="['min-w-0 text-xs text-neutral-500 font-medium dark:text-neutral-400']">{{ label }}</span>
              <span aria-hidden="true" :class="['i-solar:danger-triangle-bold-duotone size-4 shrink-0 text-violet-500']" />
            </div>
            <div v-if="showPlaceholder" :class="['i-eos-icons:three-dots-loading']" />
            <MarkdownRenderer
              v-else-if="!hasDetails"
              :content="message.content"
              class="break-words text-violet-500 dark:text-violet-300"
            />
            <template v-else>
              <p :class="['mt-1 mb-0 break-words text-sm text-neutral-800 font-medium leading-relaxed dark:text-neutral-100']">
                {{ summary }}
              </p>
              <pre
                v-if="hasDetails && detailsOpen"
                :class="[
                  'mt-3 mb-0 max-h-48 max-w-full overflow-auto',
                  'whitespace-pre-wrap break-all font-mono text-xs',
                  'text-neutral-700 dark:text-neutral-200',
                ]"
              >{{ message.content }}</pre>
            </template>
          </div>
          <BasicButton
            v-if="hasDetails && !showPlaceholder"
            size="unset"
            :aria-expanded="detailsOpen"
            :class="[
              'min-h-11 w-full px-3 py-2 text-xs text-violet-700',
              'bg-violet-200/35 hover:bg-violet-200/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500',
              'dark:bg-violet-900/40 dark:text-violet-200 dark:hover:bg-violet-800/50',
            ]"
            @click.stop="detailsOpen = !detailsOpen"
          >
            {{ t(detailsOpen ? 'stage.chat.error-details.hide' : 'stage.chat.error-details.show') }}
            <span
              aria-hidden="true"
              :class="[
                'i-solar:alt-arrow-down-linear size-3.5 shrink-0 transition-transform duration-200',
                detailsOpen && 'rotate-180',
              ]"
            />
          </BasicButton>
        </div>
      </template>
    </ChatActionMenu>
    <div
      v-if="canRetry && !showPlaceholder"
      :class="[
        'self-end mt-1 w-fit',
      ]"
    >
      <IconButton
        icon="i-solar:refresh-bold"
        :aria-label="retryLabel"
        @click="emit('retry')"
      />
    </div>
  </div>
</template>
