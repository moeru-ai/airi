<script setup lang="ts">
import type { ChatHistoryReplyPayload } from '../reply'

import { IconButton } from '@proj-airi/ui'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { getChatReplyPreview } from '../reply'

const props = defineProps<{
  target?: ChatHistoryReplyPayload
}>()

const emit = defineEmits<{
  cancel: []
}>()

const { t } = useI18n()
const contentRef = useTemplateRef<HTMLElement>('content')
const renderedTarget = shallowRef(props.target)
const expandedHeight = shallowRef(0)
const preview = computed(() => renderedTarget.value ? getChatReplyPreview(renderedTarget.value) : '')
const transitionStyle = computed(() => ({
  maxHeight: props.target ? `${expandedHeight.value}px` : '0px',
}))

watch(() => props.target, async (target) => {
  // Keep the previous content measurable while the outer region animates closed.
  if (!target)
    return

  renderedTarget.value = target
  await nextTick()
  expandedHeight.value = contentRef.value?.scrollHeight ?? 0
}, { immediate: true })
</script>

<template>
  <div
    :style="transitionStyle"
    :class="[
      'overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none',
      target ? 'opacity-100' : 'opacity-0',
      target ? '' : 'pointer-events-none',
    ]"
  >
    <div
      ref="content"
      :aria-hidden="!target"
      :class="[
        'min-w-0 flex items-center gap-2 px-3 py-2 text-left',
        'border-b border-primary-200/30 dark:border-primary-700/30',
      ]"
    >
      <div
        aria-hidden="true"
        :class="[
          'i-solar:reply-bold-duotone size-4 shrink-0',
          'text-primary-500 dark:text-primary-300',
        ]"
      />
      <div :class="['min-w-0 flex flex-1 flex-col leading-tight']">
        <span :class="['truncate text-xs text-primary-600 font-semibold dark:text-primary-300']">
          {{ t('stage.chat.reply.replying-to', { name: renderedTarget?.label ?? '' }) }}
        </span>
        <span :class="['truncate text-xs text-neutral-500 dark:text-neutral-300']">
          {{ preview || t('stage.chat.reply.message') }}
        </span>
      </div>
      <IconButton
        icon="i-solar:close-circle-bold"
        :class="[
          'size-6 shrink-0 flex items-center justify-center rounded-md outline-none',
          'text-neutral-400 transition-colors hover:bg-primary-100 hover:text-neutral-600',
          'focus-visible:ring-2 focus-visible:ring-primary-400 dark:hover:bg-primary-900 dark:hover:text-neutral-100',
        ]"
        :aria-label="t('stage.chat.reply.cancel')"
        :tabindex="target ? 0 : -1"
        @click="emit('cancel')"
      />
    </div>
  </div>
</template>
