<script setup lang="ts">
import type { ChatAssistantMessage } from '../../../../types/chat'

import { Truncatable } from '@proj-airi/ui'
import { computed } from 'vue'

import { MarkdownRenderer } from '../../../markdown'

const props = defineProps<{
  message: ChatAssistantMessage
  variant?: 'desktop' | 'mobile'
}>()

const reasoningContent = computed(() => props.message.categorization?.reasoning?.trim() ?? '')
const hasReasoning = computed(() => reasoningContent.value.length > 0)

const containerClasses = computed(() => [
  props.variant === 'mobile' ? 'text-xs' : 'text-sm',
])
</script>

<template>
  <div v-if="hasReasoning" :class="containerClasses" flex="~ col" gap-1>
    <Truncatable :line-clamp="1">
      <MarkdownRenderer
        :content="reasoningContent"
        :class="['break-words']"
        text="sm neutral-700/50 dark:neutral-300/50"
      />
    </Truncatable>
  </div>
</template>
