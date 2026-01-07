<script setup lang="ts">
import type { ChatAssistantMessage } from '../../../types/chat'

import { Collapsible } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { MarkdownRenderer } from '../../markdown'

const props = defineProps<{
  message: ChatAssistantMessage
  variant?: 'desktop' | 'mobile'
}>()

const { t } = useI18n()

const hasReasoning = computed(() => !!props.message.categorization?.reasoning?.trim())

const containerClasses = computed(() => [
  'mt-2',
  props.variant === 'mobile' ? 'text-xs' : 'text-sm',
])
</script>

<template>
  <div v-if="hasReasoning" :class="containerClasses" flex="~ col" gap-1>
    <Collapsible :default="false">
      <template #trigger="slotProps">
        <button
          class="w-full flex items-center justify-between rounded-lg bg-neutral-100/50 px-2 py-1 text-xs text-neutral-600 outline-none transition-all duration-200 dark:bg-neutral-800/50 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-700/50"
          @click="slotProps.setVisible(!slotProps.visible)"
        >
          <div flex="~ items-center" gap-1.5>
            <div i-solar:lightbulb-bolt-bold-duotone size-3.5 text-amber-500 dark:text-amber-400 />
            <span font-medium>{{ t('stage.chat.reasoning') }}</span>
          </div>
          <div
            i-solar:alt-arrow-down-linear
            size-3
            transition="transform duration-200"
            :class="{ 'rotate-180': slotProps.visible }"
          />
        </button>
      </template>
      <div
        class="mt-1 border border-neutral-200 rounded-md bg-neutral-50/80 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900/80"
      >
        <MarkdownRenderer
          :content="message.categorization?.reasoning ?? ''"
          class="break-words"
          text="xs neutral-700 dark:neutral-300"
        />
      </div>
    </Collapsible>
  </div>
</template>
