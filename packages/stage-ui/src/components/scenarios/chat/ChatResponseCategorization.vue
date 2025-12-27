<script setup lang="ts">
import type { ChatAssistantMessage } from '../../../types/chat'

import { computed } from 'vue'

import MarkdownRenderer from '../../markdown/MarkdownRenderer.vue'
import Collapsable from '../../misc/Collapsable.vue'

const props = defineProps<{
  message: ChatAssistantMessage
  variant?: 'desktop' | 'mobile'
}>()

const hasCategorization = computed(() => {
  return !!(
    props.message.categorization?.thoughts
    || props.message.categorization?.reasoning
    || props.message.categorization?.metadata
  )
})

const hasThoughts = computed(() => !!props.message.categorization?.thoughts?.trim())
const hasReasoning = computed(() => !!props.message.categorization?.reasoning?.trim())
const hasMetadata = computed(() => !!props.message.categorization?.metadata?.trim())

const containerClasses = computed(() => [
  'mt-2',
  props.variant === 'mobile' ? 'text-xs' : 'text-sm',
])
</script>

<template>
  <div v-if="hasCategorization" :class="containerClasses" flex="~ col" gap-1>
    <!-- Thoughts Section -->
    <Collapsable v-if="hasThoughts" :default="false">
      <template #trigger="slotProps">
        <button
          class="w-full flex items-center justify-between rounded-lg bg-neutral-100/50 px-2 py-1 text-xs text-neutral-600 outline-none transition-all duration-200 dark:bg-neutral-800/50 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-700/50"
          @click="slotProps.setVisible(!slotProps.visible)"
        >
          <div flex="~ items-center" gap-1.5>
            <div i-solar:brain-bold-duotone size-3.5 text-purple-500 dark:text-purple-400 />
            <span font-medium>Thoughts</span>
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
          :content="message.categorization!.thoughts!"
          class="break-words"
          text="xs neutral-700 dark:neutral-300"
        />
      </div>
    </Collapsable>

    <!-- Reasoning Section -->
    <Collapsable v-if="hasReasoning" :default="false">
      <template #trigger="slotProps">
        <button
          class="w-full flex items-center justify-between rounded-lg bg-neutral-100/50 px-2 py-1 text-xs text-neutral-600 outline-none transition-all duration-200 dark:bg-neutral-800/50 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-700/50"
          @click="slotProps.setVisible(!slotProps.visible)"
        >
          <div flex="~ items-center" gap-1.5>
            <div i-solar:lightbulb-bolt-bold-duotone size-3.5 text-amber-500 dark:text-amber-400 />
            <span font-medium>Reasoning</span>
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
          :content="message.categorization!.reasoning!"
          class="break-words"
          text="xs neutral-700 dark:neutral-300"
        />
      </div>
    </Collapsable>

    <!-- Metadata Section -->
    <Collapsable v-if="hasMetadata" :default="false">
      <template #trigger="slotProps">
        <button
          class="w-full flex items-center justify-between rounded-lg bg-neutral-100/50 px-2 py-1 text-xs text-neutral-600 outline-none transition-all duration-200 dark:bg-neutral-800/50 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-700/50"
          @click="slotProps.setVisible(!slotProps.visible)"
        >
          <div flex="~ items-center" gap-1.5>
            <div i-solar:info-circle-bold-duotone size-3.5 text-blue-500 dark:text-blue-400 />
            <span font-medium>Metadata</span>
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
          :content="message.categorization!.metadata!"
          class="break-words"
          text="xs neutral-700 dark:neutral-300"
        />
      </div>
    </Collapsable>
  </div>
</template>
