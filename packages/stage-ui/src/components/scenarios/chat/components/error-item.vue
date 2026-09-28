<script setup lang="ts">
import type { ChatHistoryItem, ErrorMessage } from '../../../../types/chat'

import { isStageCapacitor, isStageWeb } from '@proj-airi/stage-shared'
import { BasicButton, IconButton } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

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
const hasDetails = computed(() => summary.value !== props.message.content)

const boxClasses = computed(() => {
  const spacing = ['min-w-0', 'max-w-full', props.variant === 'mobile' ? 'px-2 py-2 text-sm' : 'px-3 py-3']
  if (props.surface === 'opaque')
    return [spacing, 'bg-violet-100 shadow-md dark:bg-violet-950']

  return [
    spacing,
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
            'relative',
            'flex flex-col',
            'min-w-20 rounded-xl',
            'h-unset <sm:h-fit',
            'shadow-sm shadow-violet-200/50 dark:shadow-none',
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
          <template v-else>
            <p :class="['m-0 break-words text-violet-500 dark:text-violet-300']">
              {{ summary }}
            </p>
            <BasicButton
              v-if="hasDetails"
              size="unset"
              :aria-expanded="detailsOpen"
              :class="[
                'mt-2 self-start rounded-full border px-2.5 py-1 text-xs',
                'border-violet-300/70 bg-violet-200/50 text-violet-700',
                'hover:bg-violet-200/90 focus-visible:outline-2 focus-visible:outline-violet-500',
                'dark:border-violet-700 dark:bg-violet-800/50 dark:text-violet-100 dark:hover:bg-violet-800',
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
            <pre
              v-if="hasDetails && detailsOpen"
              :class="['mt-2 mb-0 max-h-48 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/55 p-2 font-mono text-xs text-violet-700 dark:bg-black/30 dark:text-violet-200']"
            >{{ message.content }}</pre>
          </template>
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
