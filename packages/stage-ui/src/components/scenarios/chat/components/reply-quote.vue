<script setup lang="ts">
import type { ChatHistoryReplyPayload } from '../reply'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { getChatReplyPreview } from '../reply'

const props = defineProps<{
  target: ChatHistoryReplyPayload
}>()

const { t } = useI18n()
const preview = computed(() => getChatReplyPreview(props.target))
</script>

<template>
  <div
    :class="[
      'mb-1 min-w-0 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left',
      'bg-black/5 dark:bg-white/8',
    ]"
  >
    <div
      aria-hidden="true"
      :class="[
        'i-solar:reply-bold-duotone size-3.5 shrink-0',
        'text-primary-500 dark:text-primary-300',
      ]"
    />
    <div :class="['min-w-0 flex flex-1 flex-col leading-tight']">
      <span :class="['truncate text-xs text-primary-600 font-semibold dark:text-primary-300']">
        {{ t('stage.chat.reply.replying-to', { name: target.label }) }}
      </span>
      <span :class="['truncate text-xs text-neutral-500 dark:text-neutral-300']">
        {{ preview || t('stage.chat.reply.message') }}
      </span>
    </div>
  </div>
</template>
